<p align="center">
  <a href="CHANGELOG.md">English</a> &nbsp;·&nbsp; <strong>Português brasileiro</strong>
</p>

# Changelog

Mudanças entregues em cada versão do Trama. A seção **Em desenvolvimento** reúne alterações implementadas que ainda não foram lançadas; ao publicar uma versão, substitua esse título pelo número e pela data da release.

## [0.4.0](https://github.com/builtbyajax/Trama/releases/tag/v0.4.0) — 2026-10-27

### Adicionado

- Perfis de agente: cada sessão do MCP ganha um personagem próprio, com nome, cor, forma e olhos, mostrado nas tarefas com ela, na atividade e nos filtros. Os agentes o definem com a nova ferramenta `set_profile`, e uma sessão sem perfil aparece com o nome do cliente MCP.
- Página Agentes para ver cada perfil e se está ativo, parado ou desconectado, e para renomear, mudar a aparência, ver as tarefas ou excluir. Depois que você edita um perfil, o agente não muda mais. Excluir um perfil deixa as tarefas dele para qualquer agente e mantém o perfil no histórico.
- Enquanto um agente trabalha numa tarefa, o personagem dele anda pela borda de cima do cartão. Quando o agente para, ele cochila ali. Passar o ponteiro sobre um personagem o amplia.
- Atribuição de uma tarefa a um agente específico ou a qualquer agente, e filtro do quadro por agente.
- Retomada de uma sessão com o mesmo perfil, por `set_profile` com o `profile_id`. Quando uma sessão termina, as tarefas que ela tinha em andamento voltam para A fazer, ainda com o perfil dela.
- Opção nas Preferências para manter o Mac acordado enquanto um agente chamou uma ferramenta nos últimos 15 minutos, sempre ou só na tomada.

### Alterado

- Atualização do banco para o schema 13, preservando os dados. As tarefas do agente passam a ser de qualquer agente. Depois da migração, o Trama 0.3 não abre esse banco.
- `list_tasks` filtra por `agent_profile_id`, `get_context` informa o `profile_id` da sessão, e tarefas, mensagens e eventos informam o perfil que os escreveu.
- A skill do Trama orienta os agentes a se apresentar no início da sessão e a não mexer nas tarefas de outros perfis.

## [0.3.1](https://github.com/builtbyajax/Trama/releases/tag/v0.3.1) — 2026-10-26

### Alterado

- Guardar cada espaço em uma pasta própria, `Workspaces/<id>/` dentro da pasta do Trama, para que renomear um espaço não mova arquivos. Na primeira abertura, mover os espaços que versões anteriores deixavam soltos na pasta do Trama e pedir uma vez para reiniciar as sessões dos agentes. Reabrir o arquivo de um espaço pede o nome dele, já que todo arquivo se chama `workspace.sqlite`. Veja [dados locais](docs/installation.pt-BR.md#dados-locais).
- Criar espaços sem escolher pasta; **Abrir espaço…** continua abrindo um banco em qualquer lugar.
- Pedir o primeiro espaço numa instalação nova em vez de criar um, e fazer o servidor MCP pedir para abrir o Trama e criar um até lá.

### Corrigido

- Antes de atualizar o schema de um espaço, guardar uma cópia recuperável do banco numa pasta `Backups` ao lado dele, incluindo os dados confirmados no WAL, com a versão do Trama e o schema no nome; manter as últimas três cópias e interromper a migration se não for possível salvá-la. Excluir um espaço apaga as cópias também. Veja [como restaurar uma cópia](docs/installation.pt-BR.md#restaurar-uma-cópia-do-banco).

## [0.3.0](https://github.com/builtbyajax/Trama/releases/tag/v0.3.0) — 2026-10-25

### Adicionado

- Página Arquivo para as tarefas concluídas, com busca, filtro por projeto e agrupamento; as tarefas arquivadas podem ser reabertas em qualquer etapa do quadro.
- Conclusão de uma tarefa arrastando-a para a barra que aparece embaixo do quadro durante o arraste, ou pelo menu da tarefa.
- Página do projeto com o trabalho do agente, as revisões, os objetivos e as entregas recentes.
- Visualização em lista do quadro, além do Kanban, com arraste pelo teclado; a troca é feita nas Preferências ou com ⇧⌘L.
- O objetivo de cada tarefa aparece no seu cartão.
- Avisos com Desfazer mostram o tempo restante, que pausa enquanto o ponteiro ou o foco estiver no aviso.

### Alterado

- Rascunhos e Reservadas viram uma única coluna, Pendências. O banco é atualizado para o schema 12 preservando os dados existentes; após a migração, o Trama 0.2 não consegue abrir esse banco.
- As ferramentas MCP recusam os status antigos `preparing` e `reserved`, orientando a usar `backlog`, e `promote_draft` foi removida.
- As Preferências agora são divididas em Geral, Quadro, Projetos, Agente e MCP, e Atualizações, com a lista de seções sempre visível enquanto estão abertas. A seção MCP mostra o comando com o caminho do agente incluído no app e os IDs dos projetos.
- Os avisos aparecem no topo da janela, com animações de entrada e saída.
- Um único controle segmentado, navegável pelas setas do teclado, nas abas do projeto, nos filtros do quadro, no agrupamento do Arquivo, na atividade, nos diffs e nas notas.
- A skill do Trama orienta os agentes a escrever briefings, resumos de entrega e mensagens objetivos, e a nomear e usar objetivos.

## [0.2.2](https://github.com/builtbyajax/Trama/releases/tag/v0.2.2) — 2026-10-25

### Adicionado

- Busca por atualizações assinadas automaticamente ou manualmente nas Preferências; a busca manual continua disponível mesmo após encontrar uma atualização.
- Instalação da atualização disponível e reinício do app pelo aviso ou pelas Preferências, mantendo um indicador nas Preferências após dispensar o aviso.
- A atualização encontrada continua disponível após dispensar o aviso; falhas no download permitem nova tentativa e operações simultâneas são evitadas.
- No macOS, a atualização reabre o app pelo ícone existente no Dock; no Windows, a instalação é bloqueada enquanto o `trama-agent.exe` estiver em uso.
- Após uma troca de versão, recomendar reiniciar as sessões dos agentes para reconectar ao MCP incluído na versão instalada, inclusive após um downgrade.

### Alterado

- Arquivos e pastas agora são ordenados juntos por nome no explorador de notas, com ordem numérica natural.

### Corrigido

- Chamadas MCP de agentes conectados a um banco migrado por um app mais novo são recusadas.

## [0.2.1](https://github.com/builtbyajax/Trama/releases/tag/v0.2.1) — 2026-10-24

### Corrigido

- Sessões de desenvolvimento usam dados separados por padrão, evitando migrações involuntárias dos bancos pessoais.
- Requisições de hosts e origens não confiáveis são recusadas na ponte local de desenvolvimento.
- Recusa de bancos de uma versão mais nova sem alterar o arquivo principal ou os dados pendentes no WAL.
- Abertura simultânea de um espaço durante uma migração, evitando falhas por bloqueio na ativação do WAL.
- Proteção das notas contra atalhos simbólicos que apontam para pastas ocultas.
- Ação de descartar e recarregar uma nota em conflito permanece disponível ao sair do editor.
- Links de notas com escapes inválidos deixam de interromper a renderização.
- MCP passa a informar a versão real do schema e recusa valores nulos em campos obrigatórios de uma atualização de tarefa.

## [0.2.0](https://github.com/builtbyajax/Trama/releases/tag/v0.2.0) — 2026-10-24

### Adicionado

- Espaços de trabalho locais, cada um com seu próprio banco de dados.
- Criação, edição, troca, remoção e exclusão de espaços de trabalho.
- Transferência de projetos entre espaços, preservando tarefas e dados relacionados.
- Objetivos por projeto, com tarefas associadas e acompanhamento do progresso.
- Criação, consulta e edição de objetivos pelo MCP.

### Alterado

- Banco atualizado para o schema 10, preservando os dados existentes. Após a migração, o Trama 0.1.0 não abre esse banco.

## [0.1.0](https://github.com/builtbyajax/Trama/releases/tag/v0.1.0) — 2026-10-23

### Adicionado

- Aplicativo desktop para macOS e Windows, com armazenamento SQLite local.
- Quadro de tarefas com responsáveis, categorias, rascunhos, atalhos e arquivamento.
- Consulta de histórico Git, branches, diferenças de arquivos e pull requests.
- Edição de notas Markdown com busca, prévia e anexos em tarefas.
- Servidor MCP local e skill para conectar agentes de código ao quadro.
- Anotações pessoais das tarefas privadas para os agentes.
- Interface em inglês e português brasileiro.
