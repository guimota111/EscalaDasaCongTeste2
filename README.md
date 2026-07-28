# Escala de Congelação — DASA Brasília

Sistema web para organização da escala de congelação dos patologistas da DASA Brasília.

## Funcionalidades

- **Dashboard** — Calendário do mês atual com escala e balanceamento por patologista
- **Patologistas** — Cadastro e gerenciamento (regimes: Normal, Final de Semana, Plantão Fixo), férias e desligamentos
- **Estatísticas** — Contagem acumulada de plantões com gráficos
- **Feriados** — Cadastro manual de feriados
- **Gerar Escala** — Esqueleto da escala em calendário, com divisão manual da rotina
- **Escalas Anteriores** — Histórico de todas as escalas publicadas
- **Sorteios** — Sorteio entre patologistas para resolver disputas (não salva nada)

## Configuração

### 1. Firebase

1. Crie um projeto em [Firebase Console](https://console.firebase.google.com/)
2. Ative **Authentication** → Email/Senha
3. Ative **Firestore Database** (modo produção ou teste)
4. Crie um usuário em Authentication → Users
5. Adicione as regras de segurança ao Firestore:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 2. Variáveis de Ambiente

Copie `.env.example` para `.env` e preencha com as credenciais do seu projeto Firebase:

```bash
cp .env.example .env
```

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

### 3. Instalação e Execução Local

```bash
npm install
npm run dev
```

### 4. Deploy no GitHub Pages

```bash
npm run deploy
```

> **Importante:** Configure as variáveis de ambiente como Secrets no GitHub e use um workflow de CI/CD, ou faça o build localmente com `.env` preenchido.

## Hospitais

- **HAC** — Hospital Anchieta
- **HOBRA** — Hospital de Brasília

## Regimes dos Patologistas

| Regime | Descrição |
|--------|-----------|
| Normal | Segunda a quinta + reveza finais de semana |
| Final de Semana | Apenas finais de semana do seu slot (1º ao 4º) |
| Plantão Fixo | Dias fixos em determinado hospital + reveza finais de semana |

## Gerar Escala

O gerador **não divide a rotina automaticamente**. Ao gerar, ele preenche apenas
o que é determinado por regra e deixa o resto em branco para a divisão manual:

| Preenchido ao gerar | Em branco |
|---------------------|-----------|
| Plantões fixos (regime Plantão Fixo) | Rotina de Seg a Qui |
| Blocos de final de semana (Sex+Sáb+Dom, por slot) | |
| Dias antecipados na geração do mês anterior | |

A edição é feita no calendário: clique em qualquer célula HAC/HOBRA para
escolher o patologista. O seletor mostra a contagem de plantões de cada um e
esconde quem está indisponível naquele dia.

- **Dia em vermelho** — a mesma pessoa está escalada nos dois hospitais.
- **Balanceamento / Segundas e Quartas** — alterne entre **Mês** (só o mês em
  edição), **Histórico** (escalas publicadas, exceto este mês) e **Total** (os dois somados).

### Restrições

O botão **Adicionar restrições** cadastra os dias em que um patologista não pode
entrar na escala — uma data específica ou um período, com motivo opcional. Nesses
dias ele deixa de ser opção no calendário. Férias e desligamentos bloqueiam da
mesma forma.

Coleção `restrictions` no Firestore:

```js
{ pathologistId: string, start: 'YYYY-MM-DD', end: 'YYYY-MM-DD', reason: string }
```

## Lógica de Final de Semana

- Final de semana = Sexta + Sábado + Domingo
- Cada patologista tem um "slot" de 1 a 4 (1º, 2º, 3º ou 4º final de semana do mês)
- Patologistas do mesmo slot revezam entre si nos finais de semana daquele slot
