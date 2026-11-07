/*  server.pl — servicio HTTP de la IA (protocolo, sección 7).

    POST /connect4/move   {"board": [[...],...], "player": "yellow", "difficulty": "hard"}
                       -> {"column": 4, "score": 12, "depth": 6, "nodes": 4821, "ms": 85}
    GET  /health       -> {"status": "ok"}

    nginx publica estas rutas como /api/ai/connect4/move y /api/ai/health.

    Arrancar:  swipl server.pl          (puerto 8080, o el de la variable PORT)
*/
:- use_module(library(http/thread_httpd)).
:- use_module(library(http/http_dispatch)).
:- use_module(library(http/http_json)).
:- use_module(connect4).

:- http_handler(root(health),         health, [method(get)]).
:- http_handler(root(connect4/move),  move,   [method(post)]).

:- initialization(main, main).

main :-
    (   getenv('PORT', P), atom_number(P, Port) -> true ; Port = 8080 ),
    http_server(http_dispatch, [port(Port)]),
    format("IA de Prolog escuchando en el puerto ~w~n", [Port]),
    thread_get_message(_).                     % deja el servidor corriendo

health(_Request) :-
    reply_json_dict(_{status: "ok"}).

move(Request) :-
    catch(handle_move(Request), Error, reply_error(Error)).

handle_move(Request) :-
    http_read_json_dict(Request, In, [value_string_as(atom)]),
    board_from_json(In, Board),
    player_from_json(In, Player),
    depth_from_json(In, Depth),
    (   connect4:valid_move(Board, _) -> true
    ;   throw(bad_request("el tablero está lleno"))
    ),
    reset_nodes,
    get_time(T0),
    best_move(Board, Player, Depth, Column, Score),
    get_time(T1),
    nodes(Nodes),
    Ms is round((T1 - T0) * 1000),
    reply_json_dict(_{column: Column, score: Score, depth: Depth, nodes: Nodes, ms: Ms}).

board_from_json(In, Board) :-
    (   get_dict(board, In, Board), valid_board(Board) -> true
    ;   throw(bad_request("board debe tener 7 columnas de 0 a 6 fichas red/yellow"))
    ).

player_from_json(In, Player) :-
    (   get_dict(player, In, Player), memberchk(Player, [red, yellow]) -> true
    ;   throw(bad_request("player debe ser red o yellow"))
    ).

depth_from_json(In, Depth) :-
    (   get_dict(difficulty, In, D) -> true ; D = medium ),
    (   difficulty_depth(D, Depth) -> true
    ;   throw(bad_request("difficulty debe ser easy, medium o hard"))
    ).

%  Error esperado (datos mal enviados) -> 400 con el motivo.
%  Cualquier otro (por ejemplo, JSON mal formado) -> 400 con el error de Prolog.
reply_error(bad_request(Msg)) :- !,
    reply_json_dict(_{error: Msg}, [status(400)]).
reply_error(Error) :-
    format(string(Msg), "solicitud inválida: ~p", [Error]),
    reply_json_dict(_{error: Msg}, [status(400)]).
