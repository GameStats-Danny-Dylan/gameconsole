/*  connect4.pl — IA del 4 en línea: minimax con poda alfa-beta (forma negamax).

    Tablero: lista de 7 columnas (1..7). Cada columna es la lista de fichas
    de ABAJO hacia ARRIBA (máximo 6), con los átomos red y yellow.
    Soltar una ficha = agregarla al final de su columna.

        [[red], [], [yellow, red], [yellow], [], [], []]
          col1  col2      col3        col4   ...

    Uso principal:  best_move(+Board, +Player, +Depth, +Style, -Column, -Score)
*/
:- module(connect4, [
    best_move/5,          % elegir la mejor columna (evaluación completa)
    best_move/6,          % ... con un estilo de evaluación (attack | full)
    difficulty/3,         % easy/medium/hard -> profundidad y estilo
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

%% difficulty(?Name, ?Depth, ?Style): cómo juega cada dificultad.
%    Depth = cuántas jugadas mira hacia adelante (contando las del rival).
%    Style = qué mira al evaluar un tablero:
%      attack  solo sus propias líneas (no se fija en las amenazas del rival)
%      full    sus líneas y las del rival
%
%  - easy:   mira 1 jugada y solo ataca. Gana si puede, pero no tapa: es
%            como un principiante que solo piensa en su propio 4 en línea.
%  - medium: mira 3 jugadas (la suya, la respuesta y la suya). Tapa lo que
%            está por ganar el rival, pero cae en trampas de dos amenazas.
%  - hard:   mira 6 jugadas: ve trampas de dos amenazas a la vez y las
%            arma o las esquiva. (Con 7 tardaría varios segundos por jugada.)
difficulty(easy,   1, attack).
difficulty(medium, 3, full).
difficulty(hard,   6, full).

%% difficulty_depth(?Difficulty, ?Depth)
difficulty_depth(D, Depth) :- difficulty(D, Depth, _).

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

%% evaluate(+Style, +Board, +Player, -Score): qué tan bueno es el tablero para
%  Player (el que mueve ahora). Suma, en cada ventana, cuántas fichas propias y
%  rivales hay; además premia las fichas en la columna del centro (4), que
%  entran en más líneas.
%
%  full:       mira las líneas de los dos.
%  attack(Me): solo las líneas de Me (la computadora), mueva quien mueva. Si
%              le toca al rival, el puntaje va con signo contrario (negamax).
evaluate(full, Board, Player, Score) :-
    side_score(full, Board, Player, Score).
evaluate(attack(Me), Board, Player, Score) :-
    side_score(attack, Board, Me, S),
    (   Player == Me -> Score = S ; Score is -S ).

side_score(Style, Board, Player, Score) :-
    other(Player, Opp),
    aggregate_all(sum(S), (line(W), line_score(Style, Board, Player, Opp, W, S)), LinesScore),
    nth1(4, Board, Center),
    count(Center, Player, NCenter),
    Score is LinesScore + 3 * NCenter.

line_score(Style, Board, Player, Opp, Window, S) :-
    cells(Window, Board, Values),
    count(Values, Player, Mine),
    count(Values, Opp, Theirs),
    count(Values, empty, Empty),
    window_score(Style, Mine, Theirs, Empty, S).

cells([], _, []).
cells([C-R|Rest], Board, [V|Vs]) :- cell(Board, C, R, V), cells(Rest, Board, Vs).

%% count(+List, +X, -N): cuántas veces aparece X.
count([], _, 0).
count([Y|Ys], X, N) :- count(Ys, X, N0), ( Y == X -> N is N0 + 1 ; N = N0 ).

%  window_score(+Estilo, +Mías, +Rivales, +Vacías, -Puntos)
window_score(_,    3, 0, 1,  5) :- !.   % me falta una para ganar
window_score(_,    2, 0, 2,  2) :- !.   % voy armando la línea
window_score(full, 0, 3, 1, -4) :- !.   % el rival amenaza: hay que taparla
window_score(_,    _, _, _,  0).

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

%% best_move(+Board, +Player, +Depth, -Column, -Score): con evaluación completa.
best_move(Board, Player, Depth, Column, Score) :-
    best_move(Board, Player, Depth, full, Column, Score).

%% best_move(+Board, +Player, +Depth, +Style, -Column, -Score)
best_move(Board, Player, Depth, Style, Column, Score) :-
    ordered_moves(Board, Moves),
    Moves \== [],
    (   Style == attack -> Eval = attack(Player) ; Eval = Style ),
    infinity(Inf), NegInf is -Inf,
    root(Moves, Board, Player, Depth-Eval, NegInf, Inf, none, Column, Score).

%  Raíz: recorre las columnas y se queda con la de mayor puntaje.
%  Search = Profundidad-Estilo (se pasan juntos para no alargar los argumentos).
root([], _, _, _, Alpha, _, Col, Col, Alpha).
root([M|Ms], Board, Player, Search, Alpha, Beta, Col0, Col, Score) :-
    child_score(Board, M, Player, Search, Alpha, Beta, S),
    (   S > Alpha
    ->  root(Ms, Board, Player, Search, S, Beta, M, Col, Score)
    ;   root(Ms, Board, Player, Search, Alpha, Beta, Col0, Col, Score)
    ).

%  child_score: suelta la ficha en M y evalúa la posición para el rival.
child_score(Board, M, Player, Depth-Style, Alpha, Beta, Score) :-
    drop(Board, M, Player, NewBoard),
    other(Player, Opp),
    D1 is Depth - 1,
    NAlpha is -Beta, NBeta is -Alpha,
    negamax(NewBoard, D1-Style, NAlpha, NBeta, Opp, S0),
    Score is -S0.

%% negamax(+Board, +Depth-Style, +Alpha, +Beta, +Player, -Score)
%  Player es quien mueve ahora en Board.
negamax(Board, Depth-Style, Alpha, Beta, Player, Score) :-
    flag(c4_nodes, N, N + 1),
    other(Player, Opp),
    (   winner(Board, Opp)                     % el rival acaba de ganar
    ->  win_score(W), Score is -(W + Depth)
    ;   ordered_moves(Board, Moves),
        (   Moves == []                        % tablero lleno: empate
        ->  Score = 0
        ;   Depth =< 0                         % se acabó la búsqueda
        ->  evaluate(Style, Board, Player, Score)
        ;   member(M, Moves),                  % ¿gano en esta misma jugada?
            drop(Board, M, Player, B2),
            winner(B2, Player)
        ->  win_score(W), Score is W + Depth - 1   % el mismo valor que daría buscarla
        ;   infinity(Inf), NegInf is -Inf,
            moves(Moves, Board, Depth-Style, Alpha, Beta, Player, NegInf, Score)
        )
    ).

%  moves: prueba cada columna. Si Alpha >= Beta, el rival nunca dejaría
%  llegar a esta posición, así que no hace falta mirar el resto (poda).
moves([], _, _, _, _, _, Best, Best).
moves([M|Ms], Board, Search, Alpha, Beta, Player, Best0, Best) :-
    child_score(Board, M, Player, Search, Alpha, Beta, S),
    Best1 is max(Best0, S),
    Alpha1 is max(Alpha, S),
    (   Alpha1 >= Beta
    ->  Best = Best1                           % poda alfa-beta
    ;   moves(Ms, Board, Search, Alpha1, Beta, Player, Best1, Best)
    ).

%% Contador de posiciones evaluadas (para el campo "nodes" de la respuesta).
reset_nodes :- flag(c4_nodes, _, 0).
nodes(N)    :- flag(c4_nodes, N, N).
