# Na Ordem! — v3.9.3

- Ordenação e resultado na mesma tela de lista vertical; não existe mais tela horizontal de resultado.
- Espaço fixo para o resultado no topo, com a logo aparecendo somente ao final da revelação.
- Respostas reveladas progressivamente de baixo para cima (do menor colocado ao maior colocado).
- Arraste por qualquer região do card, inclusive nome, avatar ou número oculto.
- Área do número secreto aumentada e centralizada dentro do card.
- Altura das linhas ajustada ao espaço disponível, priorizando 8 cards inteiros sem rolagem; listas maiores têm rolagem interna.
- Atualização da partida e resultado mantidos no Supabase para o modo Online. Sem alterações no banco.
- O host também pode expulsar jogadores diretamente na etapa **Respondendo**, com confirmação, sejam eles aguardando ou já respondidos. A lista se atualiza e desconsidera jogadores removidos nas respostas da carta.

## v3.2.9
- Tela de identificação do Player atualizada com a nova logo oficial.
- Código da sala removido visualmente dessa etapa.
- Espaçamento vertical reajustado para celular.

## v3.2.8
- Refino visual do card de vez do jogador no modo Couch.
- Conteúdo centralizado, mais espaçamento e remoção da instrução de privacidade.

# Na Ordem! — v3.2.4

Party game multiplayer inspirado na mesma linguagem visual do Mimicou.

## Atualização do Supabase para v1.1.1

O banco existente continua sendo utilizado. Não é necessário recriar as tabelas.

A configuração atual do Supabase deve manter as migrações já aplicadas nas versões anteriores. A v3.0 não exige nenhuma nova alteração de banco de dados.

## Fluxo

### Host — PC/tablet horizontal
- Criar partida.
- Escolher o tempo de resposta em passos de 30 segundos, sem limite máximo no jogo, ou usar tempo infinito.
- Compartilhar o código de 6 dígitos, que permanece visível durante toda a partida.
- Ver jogadores entrando em tempo real, inclusive depois que a partida já começou.
- Iniciar a partida e acompanhar a sugestão de carta sincronizada com os celulares.
- Pular/aceitar temas.
- Acompanhar quem respondeu sem ver os números; quando todos os jogadores elegíveis respondem, a etapa encerra automaticamente.
- Arrastar os jogadores por qualquer ponto do card em uma lista vertical, colocando o maior número em 1º lugar (no topo) e o menor no fim. A lista permite ver ao menos 8 jogadores, rolando somente a área de cards quando houver mais participantes.
- Revelar os números de baixo para cima, na mesma lista, e ver o resultado quando todos aparecerem.
- Jogar uma nova carta ou encerrar a partida para todos.

### Player — celular
- Digitar o código da sala.
- Escolher nome e cor; cores podem ser repetidas entre jogadores.
- Entrar mesmo com uma partida em andamento.
- Se a etapa de respostas já tiver terminado, aguardar a próxima carta.
- Acompanhar a sugestão de carta enquanto o host decide qual jogar.
- Ver a frase da carta durante a rodada e o resultado de vitória/derrota no próprio aparelho.
- Usar **Sair da partida** a qualquer momento para encerrar sua participação e limpar a sessão local.
- Ao apenas bloquear a tela, minimizar o navegador ou perder conexão temporariamente, a sessão continua sendo restaurada automaticamente.

## Supabase

Este projeto usa as tabelas:

- `order_themes`
- `order_rooms`
- `order_players`
- `order_rounds`
- `order_answers`

A URL e a chave pública do Supabase já estão configuradas em `app.js`.


## Entrada por QR Code (v2.3.2)

- O Host exibe um QR Code da sala no lobby e também junto ao código durante a partida.
- O QR Code é gerado com a URL atual do jogo e o parâmetro `?room=CODIGO`.
- Ao escanear, o jogador entra diretamente no fluxo daquela sala e só precisa informar nome e cor.
- A entrada por QR segue as mesmas regras de entrada tardia: se a etapa de respostas da carta atual já terminou, o novo jogador aguarda a próxima carta.
- Não é necessária nenhuma alteração adicional no Supabase para usar o QR Code.


## v3.0 — Modo Couch

Além do modo online, o jogo agora possui **Modo Couch**, pensado para jogar no mesmo dispositivo. O host configura o tempo, cadastra nome e cor de cada participante, escolhe a carta e o aparelho passa de jogador em jogador para as respostas secretas. Cada resposta exige confirmação antes de avançar. Depois que todos respondem (ou o tempo individual termina), a partida usa a mesma tela de ordenação e revelação do modo online.

O Modo Couch é local e não exige novas tabelas ou colunas no Supabase.


## v3.0.2

Refinamento visual da Home: nova logo, novo background, espaçamento dos botões e ícones vetoriais.

## v3.4 — Painel administrativo

- Nova página `admin.html`, protegida por Supabase Auth e lista de administradores em `order_admins`.
- Gerenciamento de personagens: upload para o bucket `order-characters`, ativar/desativar, renomear, ordenar e excluir.
- Gerenciamento de temas: cadastrar, editar, ativar/desativar e excluir.
- A página principal do jogo continua em `index.html`; o painel não fica exposto na navegação do jogo.

## Personagens: Supabase Storage only (v3.6)

A partir desta versão, o frontend não possui catálogo local de personagens nem caminhos em `assets/characters`.
As imagens dos personagens devem existir exclusivamente no bucket público `order-characters` do Supabase Storage.
A tabela `order_characters` armazena `storage_path`, e o frontend monta a URL pública em tempo de execução.

O painel `admin.html` permite:
- cadastrar novos personagens diretamente no Storage;
- trocar a imagem de um personagem existente;
- migrar os 15 personagens iniciais em lote selecionando os PNGs originais;
- ativar/desativar, renomear, reordenar e excluir personagens.
