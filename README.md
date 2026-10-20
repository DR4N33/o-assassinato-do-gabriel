# O Assassinato do Gabriel

Aplicação em português para uma festa Murder Mystery de Halloween. Site 100 % estático, alojado no **GitHub Pages**, sem servidor nem base de dados.

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
3. Adicionar os jogadores e escolher o papel de cada um. As alterações ficam guardadas (cifradas) neste aparelho até publicar.
4. **Publicar**:
   - **Com token (recomendado)**: em *Publicação*, colar um *fine-grained personal access token* (GitHub → Settings → Developer settings → Fine-grained tokens → acesso só a este repositório, permissão **Contents: Read and write**). O botão *Publicar no GitHub* envia o ficheiro e o site atualiza em 1–2 minutos.
   - **Sem token**: o botão descarrega `party.json`; enviá-lo para a pasta `public/` do repositório (Add file → Upload files).
5. Copiar o convite de cada jogador (ícone ao lado do nome) e enviar por WhatsApp/SMS.

Exportar uma cópia de segurança em *Publicação* (ficheiro **não cifrado**: guardar em privado, nunca no GitHub).

## Desenvolvimento

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # testes da cifra
npm run build      # gera dist/
```

Vite + React + TypeScript. Código principal: `src/Game.tsx`, cifra: `src/crypto.ts`, publicação: `src/github.ts`.
