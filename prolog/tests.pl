/*  tests.pl — pruebas de la IA.   Correr:  swipl tests.pl            */
:- use_module(library(plunit)).
:- use_module(connect4).

:- initialization((run_tests -> halt(0) ; halt(1)), main).

empty([[], [], [], [], [], [], []]).

:- begin_tests(tablero).

test(drop_cae_arriba) :-
    drop([[red], [], [], [], [], [], []], 1, yellow, B),
    B == [[red, yellow], [], [], [], [], [], []].

test(columna_llena_no_es_valida, [fail]) :-
    valid_move([[r,y,r,y,r,y], [], [], [], [], [], []], 1).

test(gana_horizontal) :-
    winner([[red], [red], [red], [red], [], [], []], red).

test(gana_vertical) :-
    winner([[yellow, yellow, yellow, yellow], [], [], [], [], [], []], yellow).

test(gana_diagonal) :-
    winner([[red], [yellow, red], [yellow, yellow, red], [yellow, yellow, yellow, red], [], [], []], red).

test(sin_ganador, [fail]) :-
    winner([[red], [red], [red], [yellow], [], [], []], _).

:- end_tests(tablero).

:- begin_tests(ia).

test(tablero_vacio_juega_al_centro) :-
    empty(B),
    best_move(B, red, 4, 4, _).

test(gana_si_puede) :-
    % yellow tiene 3 en la columna 1: debe completar el 4 en línea.
    best_move([[yellow, yellow, yellow], [red], [red], [], [], [], [red]], yellow, 4, 1, _).

test(tapa_al_rival) :-
    % red tiene 3 abajo (columnas 1-3): yellow debe tapar en la 4.
    best_move([[red], [red], [red], [], [yellow], [yellow], []], yellow, 4, 4, _).

test(prefiere_ganar_a_tapar) :-
    % yellow puede ganar en la 7 y red amenaza en la 4: primero gana.
    best_move([[red], [red], [red], [], [], [], [yellow, yellow, yellow]], yellow, 4, 7, _).

test(nunca_elige_columna_llena) :-
    B = [[], [], [], [red, yellow, red, yellow, red, yellow], [], [], []],
    best_move(B, red, 4, Col, _),
    Col \== 4.

test(todas_las_dificultades_responden) :-
    empty(B),
    forall(difficulty(_, D, S), (best_move(B, red, D, S, Col, _), between(1, 7, Col))).

:- end_tests(ia).

:- begin_tests(dificultades).

% red tiene 3 en la columna 1 y amenaza ganar ahí. yellow tiene 2 en el
% centro: a quien solo ataca (fácil) le conviene más seguir su línea.
amenaza([[red, red, red], [], [], [yellow, yellow], [], [], []]).

jugada(Dificultad, Board, Col) :-
    difficulty(Dificultad, D, S),
    best_move(Board, yellow, D, S, Col, _).

test(facil_no_tapa) :-
    amenaza(B), jugada(easy, B, Col), Col \== 1.

test(media_tapa) :-
    amenaza(B), jugada(medium, B, 1).

test(dificil_tapa) :-
    amenaza(B), jugada(hard, B, 1).

test(facil_gana_si_puede) :-
    jugada(easy, [[yellow, yellow, yellow], [red], [red], [], [], [], [red]], 1).

% Media tapa lo que se ve en el tablero (dos rojas con espacio a los lados).
test(media_tapa_dos_abiertas) :-
    jugada(medium, [[], [], [red], [red], [], [yellow], [yellow]], M),
    memberchk(M, [2, 5]).

% Victoria forzada a varias jugadas: jugando en la 5, yellow arma amenazas
% que red no alcanza a tapar todas. Difícil (6 jugadas) la ve; media, que
% mira 1, juega otra cosa.
test(dificil_ve_la_victoria_forzada_y_media_no) :-
    B = [[red, red], [], [], [red, yellow, red, yellow, yellow], [yellow, yellow], [red], []],
    jugada(hard, B, 5),
    jugada(medium, B, M), M \== 5.

:- end_tests(dificultades).
