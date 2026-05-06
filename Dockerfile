FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pil ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
COPY index.html server.js README.md ./
COPY src ./src
COPY docs ./docs
COPY rules ./rules
COPY tools ./tools
COPY scripts ./scripts

RUN chmod +x scripts/start-web.sh

ENV HOST=0.0.0.0
ENV PORT=8787
ENV VERITE_MEDIA_AI=1
ENV VERITE_MEDIA_AI_URL=http://127.0.0.1:8790/analyze

EXPOSE 8787

CMD ["sh", "scripts/start-web.sh"]
