# Casinha Azul — operação da cantina

Demonstração web do atendimento descrito em `preparation/Fluxo_Cantina.pptx`. A administração permanece no projeto `Cantina_website`, na porta **3000**. Este projeto usa **3001**, sem autenticação e sem cobranças reais.

## Executar

Instale Node.js 24 LTS. Na pasta `C:\python_codes\Cantina-clover`, execute:

```powershell
npm install
npm start
```

Abra **http://127.0.0.1:3001**. Para parar, pressione `Ctrl+C`. Não é necessário configurar MongoDB ou `.env`. `PORT` permite outra porta; em desenvolvimento local o servidor recusa a porta 3000 para preservar a administração. O servidor escuta em `0.0.0.0` para permitir acesso pela rede local e no Render. Para restringir ao próprio computador, defina `HOST=127.0.0.1` no ambiente.

### Acessar de outro computador na mesma rede

No laptop `192.168.15.13`, reinicie o servidor após atualizar o código: `Ctrl+C` e `npm start`. No computador `192.168.15.8`, abra **http://192.168.15.13:3001**. A variável `HOST`, se definida, precisa ser `0.0.0.0`, e `PORT` deve ser `3001`. Não use `NODE_ENV=production` localmente sem definir a porta, pois em produção o padrão é 10000.

Se ainda ocorrer timeout, verifique o Firewall do Windows no laptop. Uma regra pode liberar somente TCP 3001, somente na rede privada e somente para `192.168.15.8`. Não é necessário desativar o firewall nem configurar encaminhamento de portas no roteador. Redes Wi-Fi de convidados ou com isolamento entre clientes também podem impedir a conexão.

O acesso por IP usando HTTP permite criar e salvar comandas, mas **a reabertura da interface offline exige HTTPS** (ou localhost no próprio laptop), por exigência do navegador para service workers. Para demonstrar esse recurso nos dois computadores, use a URL HTTPS do Render. Cada computador/navegador tem suas próprias comandas locais; esta demo ainda não consulta a lista de comandas de outros aparelhos.

## Hospedar a demonstração no Render

O `server.js` está preparado para um **Web Service Node.js**, com porta recebida por `PORT` e verificação em `/health`. O `render.yaml` permite criar o serviço via Blueprint, sem provisionar recursos pagos. A versão Node 24 é definida em `package.json`.

Para criar manualmente no painel do Render:

1. Envie este projeto para um repositório Git e conecte-o em **New → Web Service**.
2. Se o projeto estiver em uma subpasta do repositório, indique essa subpasta em **Root Directory**. Se estiver na raiz, deixe vazio.
3. Escolha o runtime **Node**, Build Command **`npm ci --omit=dev`** e Start Command **`npm start`**.
4. Configure **`NODE_ENV=production`**, **`HOST=0.0.0.0`** e Health Check Path **`/health`**. Deixe o Render fornecer `PORT`.
5. Opcionalmente, configure **`ADMIN_URL`** com o endereço público da administração. Sem essa variável, o link de administração fica oculto na hospedagem.
6. Publique e abra a URL HTTPS fornecida pelo Render. A porta 3001 é usada apenas no desenvolvimento local.

### Persistência no Render

O sistema de arquivos padrão do Render é temporário e pode ser apagado em reinícios ou novos deploys. Por isso, sem `DEMO_DATA_DIR`, o servidor em produção **não confirma o recebimento das operações de sincronização**: responde 503 com uma explicação, e o navegador mantém as comandas e a fila pendente. Os fluxos do demonstrador continuam funcionando, inclusive offline após o carregamento inicial.

Para habilitar a sincronização central desta demonstração, anexe um **disco persistente** a um serviço pago, defina o Mount Path como **`/var/data`** e configure **`DEMO_DATA_DIR=/var/data`**. O arquivo será `/var/data/demo-central.json`. A variável deve apontar para o disco realmente montado; apenas criar a variável não torna o diretório persistente. Use uma única instância para este receptor baseado em arquivo.

Não há integração MongoDB nesta etapa. A futura integração substituirá o receptor de demonstração. O demonstrador continua sem autenticação e com pagamentos simulados; use dados de teste ao compartilhá-lo. Dados já salvos em `127.0.0.1:3001` não são transferidos automaticamente ao endereço do Render: cada origem tem seu armazenamento local.

Referências: [Web Services](https://render.com/docs/web-services), [discos persistentes](https://render.com/docs/disks) e [Blueprints](https://render.com/docs/blueprint-spec).

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

`fake-indexeddb` é usado apenas nos testes. O teste de navegador usa Playwright com o Microsoft Edge instalado, cria dados isolados e verifica também a reabertura realmente offline. As capturas ficam em `.work/`. Não há autenticação nesta fase: o demonstrador não deve ser usado publicamente como sistema de produção.

## Evolução para Clover

O demonstrador permite validar os fluxos antes da compra ou identificação do equipamento. A organização separa regras, interface, armazenamento e envio para facilitar a adaptação. Não existe conversão automática para um aplicativo Clover: a implementação dependerá do modelo, sistema, recursos de impressão/leitura e integração de pagamento disponíveis.

Depois da validação com os voluntários: confirmar o equipamento; decidir a implementação compatível; integrar operação e administração ao serviço Node.js no Render/MongoDB; definir numeração entre aparelhos, reconciliação, estoque e backups; substituir os pagamentos simulados por uma integração validada no ambiente apropriado. A política de acesso será definida antes de publicar o serviço real, preservando a escolha atual de não exigir login no demonstrador.

Casinha Azul™ — desenvolvido por [Nebule Tech Consulting](mailto:hiratabruno@yahoo.com).
