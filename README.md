# Na Ordem! — v1.0.0

Party game multiplayer inspirado na mesma linguagem visual do Mimicou.

## Antes do primeiro teste

1. Abra seu projeto **Mimicou** no Supabase.
2. Vá em **SQL Editor > New query**.
3. Abra o arquivo `supabase_setup.sql` deste projeto.
4. Copie todo o conteúdo, cole no SQL Editor e clique em **Run**.
5. O script cria somente tabelas com prefixo `order_`, então não interfere nas tabelas do Mimicou.

## Testar localmente no computador

No Windows, dê dois cliques em `INICIAR_LOCAL.bat`.

O navegador abrirá em:

`http://localhost:5500`

## Testar com celulares

O host e os celulares precisam estar na mesma rede Wi-Fi.

Ao abrir `INICIAR_LOCAL.bat`, ele mostra o IPv4 do computador. Exemplo:

`192.168.0.15`

No celular, abra:

`http://192.168.0.15:5500`

Se o Windows perguntar sobre acesso à rede para o Python, permita em **Redes privadas**.

## Fluxo

### Host — PC/tablet horizontal
- Criar partida.
- Escolher tempo de resposta.
- Compartilhar o código de 6 dígitos.
- Ver jogadores entrando em tempo real.
- Expulsar jogadores no lobby.
- Iniciar a partida.
- Pular/aceitar temas.
- Acompanhar quem respondeu sem ver os números.
- Arrastar as cartas do menor para o maior.
- Revelar os números e ver se a ordem estava correta.
- Jogar uma nova carta.

### Player — celular
- Digitar o código da sala.
- Escolher nome e cor.
- Aguardar o host.
- Responder somente quando a carta começar.
- Acompanhar ordenação e resultado na tela do host.

## Supabase

Este projeto usa o mesmo projeto Supabase do Mimicou, mas com tabelas independentes:

- `order_themes`
- `order_rooms`
- `order_players`
- `order_rounds`
- `order_answers`

A URL e a chave pública do Supabase já estão configuradas em `app.js`.
