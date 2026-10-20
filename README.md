# O Assassinato do Gabriel

Aplicação em português para uma festa Murder Mystery.

## Primeiro acesso

A publicação inicial é privada. Abrir Organização, entrar com ChatGPT e escolher Criar a minha festa. Fazer esta configuração antes de permitir acesso público ao site. O primeiro organizador fica associado ao identificador da sua conta. Em Organização, registar o email da conta ChatGPT da Rosa.

## Preparar a festa

Criar personagens com nome, ocupação, papel, história, segredos, álibi e informações privadas. Adicionar jogadores com nome e telemóvel completo (incluindo indicativo internacional). Atribuir personagens manualmente; cada personagem e número só pode pertencer a um jogador.

Os jogadores usam o seu número, sem SMS, para obter uma sessão de 24 horas. O número não prova identidade: alguém que conheça outro número inscrito pode entrar como esse jogador, conforme a opção acordada para esta festa entre amigos. A API nunca envia a lista de jogadores ou outras personagens à sessão do jogador.

O acesso de convidados depende também da audiência do Site. Sites privados exigem acesso autorizado pela plataforma. Para entrada dos amigos apenas com telemóvel, abrir a audiência do site depois de configurar o organizador.

## Desenvolvimento

Vinext + React + Cloudflare D1. As migrações estão em drizzle/. Dados locais e publicados são separados. O teste scripts/test-game.mjs usa apenas o servidor local em 127.0.0.1:5173 e dados fictícios, removidos ao terminar.

Construção e publicação através dos helpers oficiais do plugin Sites. Configuração da base de dados em .openai/hosting.json. Não guardar credenciais no código.

## GitHub e alojamento

Este repositório guarda o código. A aplicação requer um servidor compatível com Cloudflare Workers, uma base de dados D1 e a integração de identidade Sites/ChatGPT para os organizadores. GitHub Pages, por si só, não executa esta aplicação. Docker não é necessário na arquitetura atual. A publicação online ainda não foi concluída.

Nunca incluir a base de dados local, números dos jogadores, sessões ou ficheiros de ambiente no repositório.
