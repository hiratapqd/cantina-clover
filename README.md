# Casinha Azul — operação da cantina

Demonstração web do atendimento descrito em `preparation/Fluxo_Cantina.pptx`. A administração permanece no projeto `Cantina_website`, na porta **3000**. Este projeto usa **3001**, sem autenticação e sem cobranças reais.

## Executar

Instale Node.js 24 LTS. Na pasta `C:\python_codes\Cantina-clover`, execute:

```powershell
npm install
npm start
```

Abra **http://127.0.0.1:3001**. Para parar, pressione `Ctrl+C`. Não é necessário configurar MongoDB ou `.env`. `PORT` permite outra porta; o servidor recusa a porta 3000 para preservar a administração. O servidor escuta somente neste computador.

## Experimentar o atendimento

1. Abra uma comanda; o número é automático e o nome é opcional.
2. Escolha alimentos, bebidas, livros ou diversos. Busque por nome, código ou ISBN.
3. Informe quantidade e adicione. Bazar, mensalidade/doação e rifa permitem informar o valor unitário; a rifa calcula quantidade × valor.
4. Confira os itens. Use **Corrigir** para alterar a quantidade; zero remove o item.
5. Deixe a comanda aberta para receber depois ou escolha dinheiro, débito ou Pix e confirme o **pagamento simulado**.
6. Localize comandas abertas por número ou nome. Pagamentos simulados ficam disponíveis para consulta.

O logo no topo do aparelho volta ao início; todos os itens já adicionados permanecem salvos. A quantidade e o valor ainda não adicionados no formulário precisam ser confirmados antes de sair dele.

## Acessibilidade

Fundo branco, botões azuis com texto branco, texto legível, ações com alvos grandes, identificação por palavras, navegação por teclado, foco visível e mensagens acessíveis. O botão **A+** amplia as letras e guarda a preferência. A prévia usa uma referência vertical de **720 × 1440 pixels**, adaptada ao espaço disponível no navegador; isso não comprova tamanho físico ou toque no futuro aparelho. Validar o uso com os voluntários e depois no equipamento real.

A paleta segue o [site oficial da Casinha Azul](https://grupocasinhaazul.com.br/), consultado em 12/11/2026. As cores estão centralizadas em `public/theme.css`: azul principal `#0B6BBF`, azul médio `#5A9FDC`, azul claro `#6EC1E4`, fundo suave `#DFF0F4` e branco. O azul principal recebe texto branco; os azuis claros são usados em superfícies e detalhes com texto escuro. Hover e foco usam `#045CB4`, também presente no tema do site. As mensagens de sucesso e aviso mantêm cores semânticas com texto legível.

## Catálogo e regras preservadas

O catálogo inicial foi copiado do arquivo de referência da administração, originado em `tabela_precos.xlsx`. A demonstração não lê nem altera o MongoDB ou o estoque real. Códigos e ISBN são texto. Valores são calculados em centavos inteiros; o preço de cada item é preservado na comanda.

Livros novos e usados compartilham o mesmo catálogo e podem repetir ISBN, com identificação distinta por condição. Há cinco exemplares usados de demonstração, com **custo zero e venda a R$ 10,00**. Produtos e livros exibidos como exemplo não significam disponibilidade em estoque.

**Água para fluidificar** seleciona automaticamente **Água grande 1,5 L** (código `100194`), com o preço do catálogo. Abre diretamente a quantidade, inicialmente 1. O botão **Fechar comanda** adiciona a quantidade escolhida e segue à conferência para o recebimento e a confirmação do pagamento.

## Funcionamento offline

As comandas, a sequência de números e a fila de envio ficam no **IndexedDB deste navegador**. Uma transação grava a comanda e sua operação pendente juntas. Atualizações com versão antiga são recusadas para evitar sobrescrita entre janelas. O catálogo e a interface são guardados para reabertura offline por um service worker, após uma primeira abertura online completa.

Para experimentar: marque **Simular atendimento sem internet**, abra uma comanda e adicione itens. Desmarque para enviar ao servidor de demonstração. Essa opção interrompe os envios do aplicativo; ela não desliga a rede do computador. O envio também é tentado a cada 30 segundos e quando o navegador detecta conexão.

O servidor confirma as operações e as guarda em `.data/demo-central.json`, usando identificação de operação e controle de versão para permitir novas tentativas sem duplicar comandas. A fila só remove operações confirmadas. Em caso de conflito, mantém os dados locais e mostra o problema. Isso é uma **sincronização de demonstração**, separada da administração, de Clover, de Render e do MongoDB.

Use sempre o mesmo navegador, perfil e endereço (incluindo porta). `localhost` e `127.0.0.1` têm armazenamentos separados. A numeração é sequencial **por navegador**, enquanto o identificador interno é um UUID. Numeração central entre vários aparelhos será definida com a integração. Limpar dados do site ou usar navegação privada pode apagar comandas locais. **Exportar comandas** baixa uma cópia JSON para conferência; ainda não há importação pela interface. Persistência no navegador não substitui backup ou armazenamento nativo do aparelho.

## Estrutura e manutenção

Sem etapa de compilação e sem dependências de produção:

| Arquivo | Responsabilidade |
| --- | --- |
| `server.js` | Arquivos estáticos e receptor de sincronização da demonstração |
| `public/domain.js` | Regras de quantidade, preço, total, correção e pagamento |
| `public/storage.js` | Persistência local e fila transacional |
| `public/sync.js` | Envio com confirmação e novas tentativas |
| `public/app.js` | Fluxos de atendimento e acessibilidade |
| `public/theme.css` | Paleta de cores centralizada |
| `public/catalog.json` | Cópia local do catálogo de referência |
| `public/sw.js` | Cache para abrir a interface sem conexão |
| `test/operation.test.js` | Testes de regras, persistência e sincronização |

```powershell
npm run check
npm test
npm run test:browser
```

`fake-indexeddb` é usado apenas nos testes. O teste de navegador usa Playwright com o Microsoft Edge instalado, cria dados isolados e verifica também a reabertura realmente offline. As capturas ficam em `.work/`. Não há autenticação nesta fase: o demonstrador local não deve ser exposto publicamente como sistema de produção.

## Evolução para Clover

O demonstrador permite validar os fluxos antes da compra ou identificação do equipamento. A organização separa regras, interface, armazenamento e envio para facilitar a adaptação. Não existe conversão automática para um aplicativo Clover: a implementação dependerá do modelo, sistema, recursos de impressão/leitura e integração de pagamento disponíveis.

Depois da validação com os voluntários: confirmar o equipamento; decidir a implementação compatível; integrar operação e administração ao serviço Node.js no Render/MongoDB; definir numeração entre aparelhos, reconciliação, estoque e backups; substituir os pagamentos simulados por uma integração validada no ambiente apropriado. A política de acesso será definida antes de publicar o serviço real, preservando a escolha atual de não exigir login no demonstrador.

Casinha Azul™ — desenvolvido por [Nebule Tech Consulting](mailto:hiratabruno@yahoo.com).
