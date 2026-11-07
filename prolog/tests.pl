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
    forall(difficulty_depth(_, D), (best_move(B, red, D, Col, _), between(1, 7, Col))).

:- end_tests(ia).
