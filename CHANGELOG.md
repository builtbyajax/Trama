# Changelog

Mudanças entregues em cada versão do Trama. A seção **Em desenvolvimento** reúne alterações implementadas que ainda não foram lançadas; ao publicar uma versão, substitua esse título pelo número e pela data da release.

## Em desenvolvimento

### Corrigido

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
