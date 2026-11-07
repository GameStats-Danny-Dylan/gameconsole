/*  connect4.pl — IA del 4 en línea: minimax con poda alfa-beta (forma negamax).

    Tablero: lista de 7 columnas (1..7). Cada columna es la lista de fichas
    de ABAJO hacia ARRIBA (máximo 6), con los átomos red y yellow.
    Soltar una ficha = agregarla al final de su columna.

        [[red], [], [yellow, red], [yellow], [], [], []]
          col1  col2      col3        col4   ...

    Uso principal:  best_move(+Board, +Player, +Depth, -Column, -Score)
*/
:- module(connect4, [
    best_move/5,          % elegir la mejor columna
    valid_move/2,         % columna donde todavía cabe una ficha
    drop/4,               % soltar una ficha
    winner/2,             % ¿alguien hizo 4 en línea?
    valid_board/1,        % estructura del tablero
    difficulty_depth/2,   % easy/medium/hard -> profundidad
    reset_nodes/0, nodes/1
]).

:- use_module(library(lists)).
:- use_module(library(apply)).

rows(6).
cols(7).

other(red, yellow).
other(yellow, red).

%% difficulty_depth(?Difficulty, ?Depth): cuántas jugadas mira hacia adelante.
difficulty_depth(easy,   2).
difficulty_depth(medium, 4).
difficulty_depth(hard,   6).

/* ------------------------------------------------------------------ */
/*  Tablero                                                           */
/* ------------------------------------------------------------------ */

%% valid_board(+Board): 7 columnas, cada una con 0..6 fichas red/yellow.
valid_board(Board) :-
    is_list(Board), length(Board, 7),
    forall(member(Col, Board),
           ( is_list(Col), length(Col, L), L =< 6,
             forall(member(P, Col), other(P, _)) )).

%% valid_move(+Board, ?Col): Col (1..7) todavía tiene espacio.
valid_move(Board, Col) :-
    nth1(Col, Board, Column),
    length(Column, L), rows(R), L < R.

%% drop(+Board, +Col, +Player, -NewBoard): suelta la ficha de Player en Col.
drop(Board, Col, Player, NewBoard) :-
    valid_move(Board, Col),
    nth1(Col, Board, Column, Rest),          % saca la columna Col
    append(Column, [Player], NewColumn),     % la ficha cae arriba de las demás
    nth1(Col, NewBoard, NewColumn, Rest).    % la vuelve a poner en su lugar

%% cell(+Board, +Col, +Row, -Value): red, yellow o empty.
cell(Board, Col, Row, Value) :-
    nth1(Col, Board, Column),
    ( nth1(Row, Column, V) -> Value = V ; Value = empty ).

%% ordered_moves(+Board, -Moves): columnas libres, del centro hacia afuera.
%  Probar primero el centro hace que la poda alfa-beta corte mucho antes.
ordered_moves(Board, Moves) :-
    include(valid_move(Board), [4, 3, 5, 2, 6, 1, 7], Moves).

/* ------------------------------------------------------------------ */
/*  Líneas de 4 ("ventanas")                                          */
/* ------------------------------------------------------------------ */

%% window(-Cells): 4 casillas seguidas en horizontal, vertical o diagonal.
window([C1-R1, C2-R2, C3-R3, C4-R4]) :-
    member(DC-DR, [1-0, 0-1, 1-1, 1-(-1)]),
    cols(MaxC), rows(MaxR),
    between(1, MaxC, C1), between(1, MaxR, R1),
    C4 is C1 + 3*DC, R4 is R1 + 3*DR,
    between(1, MaxC, C4), between(1, MaxR, R4),
    C2 is C1 + DC,   R2 is R1 + DR,
    C3 is C1 + 2*DC, R3 is R1 + 2*DR.

%% line(?Cells): las 69 ventanas del tablero guardadas como hechos sueltos.
%  Se calculan una sola vez al cargar el archivo; así recorrerlas no copia
%  ninguna lista grande en cada posición que se evalúa.
:- dynamic line/1.
build_lines :-
    retractall(line(_)),
    forall(window(W), assertz(line(W))).
:- initialization(build_lines).

%% winner(+Board, ?Player): Player tiene 4 en línea.
winner(Board, Player) :-
    other(Player, _),
    line(W),
    forall(member(C-R, W), cell(Board, C, R, Player)), !.

/* ------------------------------------------------------------------ */
/*  Evaluación (cuando se acaba la profundidad)                       */
/* ------------------------------------------------------------------ */

%% evaluate(+Board, +Player, -Score): qué tan bueno es el tablero para Player.
%  Suma, en cada ventana, cuántas fichas propias y rivales hay; además
%  premia las fichas en la columna del centro (4), que entran en más líneas.
evaluate(Board, Player, Score) :-
    other(Player, Opp),
    aggregate_all(sum(S), (line(W), line_score(Board, Player, Opp, W, S)), LinesScore),
    nth1(4, Board, Center),
    count(Center, Player, NCenter),
    Score is LinesScore + 3 * NCenter.

line_score(Board, Player, Opp, Window, S) :-
    cells(Window, Board, Values),
    count(Values, Player, Mine),
    count(Values, Opp, Theirs),
    count(Values, empty, Empty),
    window_score(Mine, Theirs, Empty, S).

cells([], _, []).
cells([C-R|Rest], Board, [V|Vs]) :- cell(Board, C, R, V), cells(Rest, Board, Vs).

%% count(+List, +X, -N): cuántas veces aparece X.
count([], _, 0).
count([Y|Ys], X, N) :- count(Ys, X, N0), ( Y == X -> N is N0 + 1 ; N = N0 ).

%  window_score(+Mías, +Rivales, +Vacías, -Puntos)
window_score(3, 0, 1,  5) :- !.   % me falta una para ganar
window_score(2, 0, 2,  2) :- !.   % voy armando la línea
window_score(0, 3, 1, -4) :- !.   % el rival amenaza: hay que taparla
window_score(_, _, _,  0).

/* ------------------------------------------------------------------ */
/*  Minimax con poda alfa-beta (negamax)                              */
/* ------------------------------------------------------------------ */
/*  En negamax el puntaje siempre es "desde el punto de vista del que
    mueve". Lo que es bueno para mí es malo para el rival, así que el
    valor de una jugada es el NEGATIVO del valor que obtiene el rival.

    Ganar vale 1_000_000 más la profundidad que quedaba: así la IA
    prefiere ganar lo antes posible y, si va a perder, perder lo más
    tarde posible.                                                     */

win_score(1000000).
infinity(10000000).

%% best_move(+Board, +Player, +Depth, -Column, -Score)
best_move(Board, Player, Depth, Column, Score) :-
    ordered_moves(Board, Moves),
    Moves \== [],
    infinity(Inf), NegInf is -Inf,
    root(Moves, Board, Player, Depth, NegInf, Inf, none, Column, Score).

%  Raíz: recorre las columnas y se queda con la de mayor puntaje.
root([], _, _, _, Alpha, _, Col, Col, Alpha).
root([M|Ms], Board, Player, Depth, Alpha, Beta, Col0, Col, Score) :-
    child_score(Board, M, Player, Depth, Alpha, Beta, S),
    (   S > Alpha
    ->  root(Ms, Board, Player, Depth, S, Beta, M, Col, Score)
    ;   root(Ms, Board, Player, Depth, Alpha, Beta, Col0, Col, Score)
    ).

%  child_score: suelta la ficha en M y evalúa la posición para el rival.
child_score(Board, M, Player, Depth, Alpha, Beta, Score) :-
    drop(Board, M, Player, NewBoard),
    other(Player, Opp),
    D1 is Depth - 1,
    NAlpha is -Beta, NBeta is -Alpha,
    negamax(NewBoard, D1, NAlpha, NBeta, Opp, S0),
    Score is -S0.

%% negamax(+Board, +Depth, +Alpha, +Beta, +Player, -Score)
%  Player es quien mueve ahora en Board.
negamax(Board, Depth, Alpha, Beta, Player, Score) :-
    flag(c4_nodes, N, N + 1),
    other(Player, Opp),
    (   winner(Board, Opp)                     % el rival acaba de ganar
    ->  win_score(W), Score is -(W + Depth)
    ;   ordered_moves(Board, Moves),
        (   Moves == []                        % tablero lleno: empate
        ->  Score = 0
        ;   Depth =< 0                         % se acabó la búsqueda
        ->  evaluate(Board, Player, Score)
        ;   infinity(Inf), NegInf is -Inf,
            moves(Moves, Board, Depth, Alpha, Beta, Player, NegInf, Score)
        )
    ).

%  moves: prueba cada columna. Si Alpha >= Beta, el rival nunca dejaría
%  llegar a esta posición, así que no hace falta mirar el resto (poda).
moves([], _, _, _, _, _, Best, Best).
moves([M|Ms], Board, Depth, Alpha, Beta, Player, Best0, Best) :-
    child_score(Board, M, Player, Depth, Alpha, Beta, S),
    Best1 is max(Best0, S),
    Alpha1 is max(Alpha, S),
    (   Alpha1 >= Beta
    ->  Best = Best1                           % poda alfa-beta
    ;   moves(Ms, Board, Depth, Alpha1, Beta, Player, Best1, Best)
    ).

%% Contador de posiciones evaluadas (para el campo "nodes" de la respuesta).
reset_nodes :- flag(c4_nodes, _, 0).
nodes(N)    :- flag(c4_nodes, N, N).
