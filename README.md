# O Assassinato do Gabriel

Aplicação em português para uma festa Murder Mystery de Halloween. Funciona de duas maneiras:

- **Docker** (recomendado para gerir): servidor próprio, tudo instantâneo, sem token — ver [Docker](#docker).
- **GitHub Pages**: site estático gratuito, gravação via token GitHub.

## Como funciona

- **Organização** (`?mode=admin`): protegida por uma palavra-passe. Adicionam-se os jogadores e escolhe-se o papel de cada um (Assassino, Cúmplice, Testemunha, Suspeito, Vítima), com um dossiê opcional (história, segredo, álibi…). Cada jogador recebe um **código secreto** de 6 caracteres (ex.: `K7M-2QX`).
- **Jogadores**: abrem o site e introduzem o seu código (ou usam o link pessoal `?codigo=…`). Só veem o seu próprio papel e dossiê.
- **Segurança**: tudo é guardado em `public/party.json`, **cifrado** no navegador (AES-256-GCM, chave PBKDF2-SHA256). O bloco da organização abre-se com a palavra-passe; cada ficha de jogador abre-se apenas com o código desse jogador. Mesmo com o repositório público, ninguém lê os segredos sem a chave.

## Primeira configuração (uma vez)

1. **Tornar o repositório público** (Settings → General → Danger Zone → Change visibility). No plano gratuito, o GitHub Pages só funciona com repositórios públicos. Os segredos estão cifrados, por isso não há problema.
2. **Ativar o Pages**: Settings → Pages → *Build and deployment* → Source: **GitHub Actions**.
3. Cada push para `main` publica o site em `https://<utilizador>.github.io/o-assassinato-do-gabriel/`.

## Preparar a festa

1. Abrir `https://<utilizador>.github.io/o-assassinato-do-gabriel/?mode=admin`.
2. Primeira vez: escolher a palavra-passe da organização (partilhar só com a Rosa).
3. **Ligar o GitHub (uma vez por aparelho)**: em *Publicação*, colar um *fine-grained personal access token* (GitHub → Settings → Developer settings → Fine-grained tokens → acesso só a este repositório, permissão **Contents: Read and write**). Fazer o mesmo no telemóvel da Rosa.
4. Adicionar os jogadores e escolher o papel de cada um. **Guardar grava logo no GitHub**: a app vai sempre buscar a versão mais recente antes de gravar (o André e a Rosa podem trabalhar ao mesmo tempo sem apagar o trabalho do outro) e atualiza-se sozinha com as alterações do outro. Os convidados veem as alterações 1–2 minutos depois.
   - Sem token: as alterações ficam no aparelho e o botão descarrega `party.json` para enviar à mão para `public/`.
5. **No dia**: em *Publicação → QR code para a porta*, imprimir o QR. Os convidados leem o QR, metem o código de 6 caracteres e descobrem o papel. (Também se pode copiar o convite pessoal de cada jogador — ícone ao lado do nome.)

Exportar uma cópia de segurança em *Publicação* (ficheiro **não cifrado**: guardar em privado, nunca no GitHub).

## Docker

Requisitos: uma máquina sempre ligada com Docker (servidor em casa, NAS, Raspberry Pi, VPS).

```bash
git clone https://github.com/DR4N33/o-assassinato-do-gabriel.git
cd o-assassinato-do-gabriel
cp .env.example .env          # definir ADMIN_PASSWORD (frase longa, partilhada só com a Rosa)
docker compose up -d --build
```

- Jogo: `http://<ip-do-servidor>:8080` · Organização: `http://<ip-do-servidor>:8080/?mode=admin` (entrar com `ADMIN_PASSWORD`).
- Dados no volume `festa-data` (`/data/party.json`, cifrado). Backup: `docker compose cp app:/data/party.json ./party-backup.json`.
- Atualizar depois de mudanças no código: `git pull && docker compose up -d --build`.

### Acesso pela internet (Cloudflare Tunnel, sem abrir portas)

1. Cloudflare → **Zero Trust → Networks → Tunnels → Create a tunnel** (tipo *Cloudflared*) → copiar o token.
2. No túnel, **Public hostname**: ex. `gabriel.teudominio.com` → *Service* `HTTP` → `app:8080`.
3. Colar o token em `TUNNEL_TOKEN` no `.env` e arrancar com o túnel: `docker compose --profile tunnel up -d --build`.
4. O QR code (em *Publicação*) usa automaticamente o endereço por onde abriram a organização — abram-na pelo endereço público antes de imprimir.

## Desenvolvimento

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # testes da cifra
npm run build      # gera dist/
```

Vite + React + TypeScript. Código principal: `src/Game.tsx`, cifra: `src/crypto.ts`, publicação: `src/github.ts`.
