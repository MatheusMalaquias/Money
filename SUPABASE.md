# Login e sincronização (Supabase)

Sem isto o Money funciona normalmente, só que cada aparelho guarda os próprios dados. Com isto, vocês dois entram
com e-mail e senha e veem os mesmos dados nos dois celulares, em tempo real, inclusive depois de ficar sem internet.

Usa o **mesmo projeto Supabase do app Time**: a mesma conta (e-mail e senha) vale nos dois apps.
As tabelas do Money têm o prefixo `money_` e não mexem em nada do Time.

## 1. Criar as tabelas (uma vez)
1. No painel do Supabase, abra **SQL Editor → New query**.
2. Cole **todo** o conteúdo de `supabase/money.sql` e clique em **Run**. Deve aparecer "Success. No rows returned".
   (Pode rodar de novo sem estragar nada.)
3. Em **Database → Tables** devem existir `money_households`, `money_members` e `money_records`, com o cadeado do RLS ligado.

## 2. Pegar as chaves
**Project Settings → API**: copie a **Project URL** e a chave **anon / publishable**.
A chave `service_role` **nunca** vai no app nem no GitHub.

## 3. Rodar no computador
```bash
cp .env.example .env     # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev
```
O arquivo `.env` está no `.gitignore` e não sobe para o GitHub.

## 4. Publicar no GitHub Pages
No repositório: **Settings → Secrets and variables → Actions → Variables** e crie:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

E em **Settings → Pages → Source: GitHub Actions**. A cada `git push` na `main` o app é publicado em
`https://matheusmalaquias.github.io/Money/`.

## 5. Ajustes de autenticação (Authentication → URL Configuration)
Os links dos e-mails (confirmar conta, "Esqueci a senha") precisam voltar para o app:
- **Redirect URLs**: adicione `https://matheusmalaquias.github.io/Money/` e `http://localhost:5173/`
  (mantenha as do Time; o *Site URL* pode continuar o do Time).

## 6. Primeiro uso
1. A primeira pessoa abre o app, **cria a conta**, confirma o e-mail (se a confirmação estiver ligada) e entra.
2. Toca em **Criar o espaço**. Os dados que já estavam no aparelho sobem para a nuvem.
3. Em **Ajustes → Conta e sincronização** aparece o **código do espaço** (12 caracteres). Envie para a outra pessoa.
4. A outra pessoa cria a conta dela, toca em **Tenho um código**, digita o código e entra: os dados aparecem.
O espaço aceita **duas pessoas**.

## Como funciona (resumo)
- Cada aparelho continua gravando no próprio banco local (IndexedDB): o app abre e funciona sem internet.
- Toda alteração entra numa fila e sobe sozinha. A nuvem avisa o outro aparelho na hora (Realtime); há também uma
  conferência a cada 1 minuto, ao voltar para o app e quando a internet volta.
- Se os dois editarem o **mesmo** lançamento ao mesmo tempo, vale o que chegar por último à nuvem.
- Apagar vira uma "lápide" na nuvem, para o outro aparelho apagar também.
- **Zerar tudo** e **Importar backup** substituem também a nuvem (e, portanto, o outro aparelho).
- **Sair da conta** apaga os dados daquele aparelho (continuam na nuvem e voltam ao entrar de novo).

## Segurança
- Quem protege os dados é o RLS: só quem é do espaço lê e grava as linhas dele. A chave anon sozinha não lê nada.
- Os dados ficam **sem criptografia** no Supabase (o painel de quem administra o projeto consegue ver).
- O código do espaço dá acesso aos dados: só envie para a outra pessoa. Para entrar é preciso ter conta e o espaço
  aceita só duas pessoas.
- O PIN de bloqueio (Ajustes → Segurança) é separado do login e protege o aparelho.

## Conferir se está tudo certo
- Com **dois** navegadores (ou o celular e o computador), entre com contas diferentes no mesmo espaço e lance
  uma conta num deles: ela aparece no outro em poucos segundos.
- Desligue a internet de um, lance algo, ligue de novo: deve subir sozinho (Ajustes mostra o estado).
- **Table Editor → money_records**: as linhas aparecem com `store`, `id` e `data`.
