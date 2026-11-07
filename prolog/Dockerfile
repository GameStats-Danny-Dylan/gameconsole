# IA del 4 en línea (SWI-Prolog). Corre las pruebas al construir: si una
# falla, la imagen no se crea.
FROM swipl:10.0.2

WORKDIR /app
COPY connect4.pl server.pl tests.pl ./
RUN swipl tests.pl

RUN useradd --system --no-create-home ia
USER ia

ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD swipl -g "use_module(library(http/http_open)), http_open('http://127.0.0.1:8080/health', S, []), close(S)" -t halt
CMD ["swipl", "server.pl"]
