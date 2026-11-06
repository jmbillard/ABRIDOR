# 🧾 ABRIDOR

🗨️ **pt-BR** ⚡ Extensão do After Effects para agilizar a criação dos layouts de uma abertura ⚡

O **ABRIDOR** lê arquivos **PPTX** e **PDF** diretamente, sem conversões nem sites externos, e recria cada página/slide como uma comp do After Effects, com os textos o mais fiéis possível ao original: posição, alinhamento, tamanho, entrelinha, cor, rotação e fontes.

> 📂 **arquivos:**\
> • **abridor-cep/** → a extensão (painel CEP).\
> • **instalar_windows.bat** / **instalar_mac.command** → instaladores.\
> • **ABRIDOR 0.2b.jsxbin** → versão anterior (script que dependia do JSON do site da Adobe).

<br>

---

<br>

## 📍 instalação

1. feche o After Effects.
2. execute o instalador do seu sistema:
   - **Windows** → `instalar_windows.bat` (duplo clique).
   - **macOS** → `instalar_mac.command` (duplo clique; se o macOS bloquear, clique com o botão direito → *Abrir*).
3. abra o After Effects e acesse `Janela` > `Extensões` > `ABRIDOR`.

> 🚩 *obs:*\
> • a extensão não é assinada, por isso o instalador habilita o `PlayerDebugMode` do CEP.\
> • requer **After Effects 2020 (17.0)** ou superior.\
> • a lista de fontes instaladas e o preview delas usam a API `app.fonts`, disponível no **After Effects 2024 (24.0)** ou superior. em versões anteriores digite o nome PostScript da fonte.\
> • textos com estilos misturados (ex. função em uma fonte e nome em outra na mesma caixa) usam `characterRange`, do **After Effects 2024 (24.3)** ou superior. em versões anteriores a camada recebe o estilo predominante.

<br>

---

<br>

## 📍 o painel

o painel tem 3 abas e o botão **criar comps** no rodapé.

### 1. páginas

clique em **abrir PPTX / PDF** e escolha o arquivo. todas as páginas aparecem em miniatura com os textos detectados destacados (azul = caixa de texto, laranja = texto de ponto).

- **clique na miniatura** (ou na caixa de seleção) para incluir/excluir a página do processamento.
- **todas / nenhuma / inverter** → seleção rápida.
- **intervalo** → digite `1-3, 5, 8-` e clique em **ok** para selecionar somente essas páginas.
- **slides ocultos** do PowerPoint já vêm desmarcados.
- o campo numérico de cada página muda **a duração só daquela página** (vazio = duração padrão).
- **imagens externas…** → usa imagens exportadas do PowerPoint (`Arquivo > Exportar > PNG`) como referência, associadas pela ordem numérica dos arquivos.

### 2. comps

- **resolução** → UHD 4K (3840 × 2160), Full HD (1920 × 1080), HD (1280 × 720) ou personalizada.
- **frame rate** → padrão **29,97**. também 23,976 / 24 / 25 / 30 / 50 / 59,94 / 60.
- **encaixe** → *ajustar* (a página inteira fica visível) ou *preencher* (corta as bordas).
- **duração por página** → em segundos, com o timecode e o total em frames.
- **nome** → as comps são nomeadas `NOME 01`, `NOME 02`, …
- **comp master** → uma comp com todas as páginas em sequência, com marcadores.
- **imagem de referência** → render da página como camada guia, travada e com opacidade ajustável. camadas guia não aparecem no render final.
- **PDF: agrupar linhas em parágrafos** ou **uma camada por linha**.
- **PPTX: ignorar a redução automática** de texto do PowerPoint.
- **fonte reserva** → nome PostScript usado quando uma fonte não estiver associada.

### 3. fontes

lista as fontes do documento com quantas vezes cada uma é usada nas páginas selecionadas.

- cada fonte é **associada automaticamente** a uma fonte instalada (pelo nome PostScript, família e estilo). verde = automático, azul = escolhido por você, vermelho = não encontrada.
- escolha **família** e **estilo** para trocar. o **preview** mostra o texto do próprio documento na fonte nova; em cinza, o texto na fonte original (se estiver instalada).
- **escala (%)** → ajusta o tamanho da fonte nova (útil quando a substituta é maior/menor).
- **texto do preview** e **tamanho** são ajustáveis no topo da aba.
- as escolhas manuais ficam memorizadas para os próximos documentos.

#### 🔁 trocar fontes depois de criar as comps

as camadas criadas guardam a fonte original no comentário (`ABRIDOR {...}`). por isso dá para trocar as fontes a qualquer momento, inclusive em outro dia:

1. abra o projeto e vá na aba **fontes**.
2. clique em **ler do projeto** (lista as fontes das camadas já criadas e o último mapeamento salvo).
3. troque as fontes e clique em **aplicar fontes** (em todas as comps ou só nas selecionadas).

> 🚩 *obs:*\
> • a troca preserva tamanhos ajustados manualmente (exceto em camadas com estilos misturados) e funciona também com keyframes de *Source Text*.\
> • duplo clique no nome da fonte seleciona, na comp ativa, as camadas que a usam.

<br>

---

<br>

## 📍 como os textos são recriados

| | **PPTX** | **PDF** |
| --- | --- | --- |
| posição | caixa de texto (*paragraph text*) do tamanho da caixa do PowerPoint, sem as margens internas | texto de ponto ancorado na **linha de base** exata da 1ª linha |
| alinhamento | horizontal (esq./centro/dir./justificado) e vertical (topo/meio/base) | detectado pela geometria das linhas |
| fonte / tamanho / cor | herdados de slide → layout → mestre → tema | nome PostScript embutido, tamanho e cor exata do PDF |
| entrelinha | espaçamento de linha do PowerPoint (incl. redução automática) | distância medida entre as linhas |
| outros | rotação, grupos, tabelas, placeholders, maiúsculas, espaçamento entre letras | rotação, trechos com cores/fontes diferentes |

> 🚩 *obs:*\
> • textos que estão como **imagem** ou **curvas** no PDF não podem ser extraídos.\
> • a imagem de referência de um PPTX é uma renderização aproximada (fundo, imagens, formas e textos). para referência exata, exporte os slides como PNG e use **imagens externas…**, ou salve o PPTX como PDF.\
> • se a caixa de texto do After Effects ficar menor que o texto (fonte substituta mais larga), as camadas são criadas com folga extra na altura para não cortar linhas.

<br>

---

<br>

## 📍 desenvolvimento

```
abridor-cep/
├── CSXS/manifest.xml     → manifesto CEP (AEFT 17+)
├── index.html            → interface
├── css/style.css
├── js/
│   ├── cep.js            → ponte com o AE (evalScript) e sistema de arquivos (Node)
│   ├── pptx-parser.js    → leitura do PPTX (zip + XML)
│   ├── pdf-parser.js     → leitura do PDF (pdf.js)
│   ├── render.js         → miniaturas / referência de PPTX
│   ├── fonts.js          → fontes instaladas, associação automática, preview
│   ├── app.js            → lógica do painel
│   └── lib/              → JSZip 3.10.1, pdf.js 3.11.174 (legacy)
└── jsx/host.jsx          → criação das comps e troca de fontes (ExtendScript)
```

- depuração: com o painel aberto no AE, acesse `http://localhost:8099` no Chrome (arquivo `.debug`).
- testes fora do After Effects (Node + Playwright):
  - `node tests/run_panel.js <arquivo.pptx|pdf> <saída>` → abre o painel no Chromium com o AE simulado, extrai e gera o job.
  - `node tests/host_mock.js <saída>/job.json <saída>/host` → executa o `host.jsx` contra um mock do After Effects e desenha as camadas sobre a referência.
  - `python3 tests/make_test_pptx.py <arquivo.pptx>` → gera um PPTX com casos variados.
- `js/lib/pdf.js` e `pdf.worker.js` têm uma alteração: `isNodeJS = false`, porque o CEP expõe `process` e o pdf.js tentaria usar APIs do Node.

<br>

---

<br>

## 📍 versão anterior (v0.2b)

o script `ABRIDOR 0.2b.jsxbin` (`File` > `Scripts` > `Run Script File...`) cria o layout a partir do arquivo **JSON** exportado pelo site *Adobe PDF Extract*. ele continua no repositório, mas a extensão substitui esse fluxo.
