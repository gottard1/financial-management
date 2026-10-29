import React, { useState } from 'react';
import { useAuth } from './AuthProvider.jsx';
import { firebaseConfigured } from '../../infrastructure/firebase/client.js';
import './auth.css';

export function AuthScreen() {
  const { loading, signIn, signUp, signInGoogle, resetPassword, enterLocalMode, configError } =
    useAuth();
  const [view, setView] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const disabled = !firebaseConfigured || Boolean(configError) || busy || loading;
  const isSignUp = view === 'signup';
  const isReset = view === 'reset';
  function changeView(next) {
    setView(next);
    setPassword('');
    setConfirmation('');
    setError('');
    setSuccess('');
  }
  async function submit(event) {
    event.preventDefault();
    if (disabled) return;
    setError('');
    setSuccess('');
    if (isSignUp && password !== confirmation) {
      setError('As senhas não coincidem. Confira a confirmação.');
      return;
    }
    setBusy(true);
    try {
      if (isReset) {
        await resetPassword(email);
        setSuccess(
          'Se houver uma conta com este e-mail, você receberá as instruções para redefinir a senha.',
        );
      } else if (isSignUp) {
        await signUp(email, password);
        setPassword('');
        setConfirmation('');
      } else {
        await signIn(email, password);
        setPassword('');
      }
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    if (disabled) return;
    setError('');
    setSuccess('');
    setBusy(true);
    try {
      await signInGoogle();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  function useLocal() {
    setError('');
    try {
      enterLocalMode();
    } catch (failure) {
      setError(failure.message);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="Contas e Planos">
        <div className="auth-brand">
          <span aria-hidden="true">↗</span>contas &amp; planos
        </div>
        <div className="auth-story-content">
          <p className="auth-eyebrow">CLAREZA PARA OS SEUS PLANOS</p>
          <h1>
            Seu dinheiro. <br />
            Mais possibilidades.
          </h1>
          <p>
            Um espaço para entender suas finanças, dividir contas em grupo e construir o que vem
            depois.
          </p>
          <div className="auth-paths">
            <div>
              <span aria-hidden="true">◫</span>
              <section>
                <strong>Seu mês em perspectiva</strong>
                <p>Rendas, gastos e reservas no mesmo lugar.</p>
              </section>
            </div>
            <div>
              <span aria-hidden="true">↔</span>
              <section>
                <strong>Cada pessoa, sua parte</strong>
                <p>Divisões claras para todos os participantes.</p>
              </section>
            </div>
            <div>
              <span aria-hidden="true">◎</span>
              <section>
                <strong>Planos que saem do papel</strong>
                <p>Orçamentos e metas para acompanhar o progresso.</p>
              </section>
            </div>
          </div>
        </div>
        <p className="auth-story-foot">Organize o presente. Abra espaço para o que importa.</p>
      </section>
      <section className="auth-access">
        <div className="auth-card">
          <p className="auth-eyebrow">SEU ESPAÇO FINANCEIRO</p>
          <h2>
            {isReset
              ? 'Vamos recuperar seu acesso.'
              : isSignUp
                ? 'Comece seus próximos planos.'
                : 'Bom ter você por aqui.'}
          </h2>
          <p className="auth-description">
            {isReset
              ? 'Informe seu e-mail para receber as instruções de recuperação.'
              : isSignUp
                ? 'Crie uma conta para acessar o seu espaço.'
                : 'Entre para organizar suas contas e acompanhar seus planos.'}
          </p>
          {loading ? (
            <div className="auth-loading" role="status">
              <span className="auth-spinner" aria-hidden="true" />
              Verificando sua sessão…
            </div>
          ) : (
            <>
              {!firebaseConfigured && (
                <div className="auth-feedback auth-setup" role="status">
                  <strong>Configuração de acesso pendente</strong>
                  <p>
                    {import.meta.env.DEV
                      ? 'O login estará disponível quando o Firebase for conectado.'
                      : 'A administração precisa concluir a configuração de acesso para liberar o login.'}
                  </p>
                  {import.meta.env.DEV && (
                    <p>
                      Para configurar este ambiente, preencha as variáveis de{' '}
                      <code>.env.local</code> seguindo <code>.env.example</code> e reinicie o
                      servidor.
                    </p>
                  )}
                </div>
              )}
              {configError && (
                <div className="auth-feedback auth-error" role="alert">
                  {configError}
                </div>
              )}
              {!isReset && (
                <div className="auth-view-switch" role="group" aria-label="Tipo de acesso">
                  <button
                    type="button"
                    aria-pressed={!isSignUp}
                    className={!isSignUp ? 'selected' : ''}
                    disabled={busy}
                    onClick={() => changeView('signin')}
                  >
                    Entrar
                  </button>
                  <button
                    type="button"
                    aria-pressed={isSignUp}
                    className={isSignUp ? 'selected' : ''}
                    disabled={busy}
                    onClick={() => changeView('signup')}
                  >
                    Criar conta
                  </button>
                </div>
              )}
              <form className="auth-form" onSubmit={submit}>
                <fieldset disabled={disabled}>
                  <legend className="auth-sr-only">
                    {isReset ? 'Recuperar senha' : isSignUp ? 'Criar conta' : 'Entrar na conta'}
                  </legend>
                  <label>
                    E-mail
                    <input
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      required
                      maxLength={254}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="voce@exemplo.com"
                    />
                  </label>
                  {!isReset && (
                    <label>
                      Senha
                      <input
                        type="password"
                        autoComplete={isSignUp ? 'new-password' : 'current-password'}
                        required
                        minLength={isSignUp ? 6 : undefined}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder={isSignUp ? 'Pelo menos 6 caracteres' : 'Sua senha'}
                      />
                      {isSignUp && <small>Use uma senha exclusiva para esta conta.</small>}
                    </label>
                  )}
                  {isSignUp && (
                    <label>
                      Confirmar senha
                      <input
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={6}
                        value={confirmation}
                        onChange={(event) => setConfirmation(event.target.value)}
                        placeholder="Repita sua senha"
                      />
                    </label>
                  )}
                  {!isReset && !isSignUp && (
                    <button type="button" className="auth-link" onClick={() => changeView('reset')}>
                      Esqueci minha senha
                    </button>
                  )}
                  <button className="auth-submit" type="submit">
                    {busy
                      ? 'Aguarde…'
                      : isReset
                        ? 'Enviar instruções'
                        : isSignUp
                          ? 'Criar minha conta'
                          : 'Entrar no meu espaço'}
                  </button>
                </fieldset>
              </form>
              {!isReset && (
                <>
                  <div className="auth-divider">
                    <span>ou continue com</span>
                  </div>
                  <button
                    type="button"
                    className="auth-google"
                    disabled={disabled}
                    onClick={google}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19">
                      <path
                        fill="#4285F4"
                        d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 2.98-4.33 2.98-7.35Z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 22c2.7 0 4.96-.9 6.62-2.42l-3.24-2.5c-.9.6-2.05.97-3.38.97-2.6 0-4.81-1.76-5.6-4.12H3.06v2.58A10 10 0 0 0 12 22Z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M6.4 13.93A6 6 0 0 1 6.09 12c0-.67.11-1.32.31-1.93V7.49H3.06A10 10 0 0 0 2 12c0 1.61.38 3.14 1.06 4.51l3.34-2.58Z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.95c1.47 0 2.79.51 3.82 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.49l3.34 2.58A6 6 0 0 1 12 5.95Z"
                      />
                    </svg>
                    Continuar com Google
                  </button>
                </>
              )}
              {isReset && (
                <button
                  type="button"
                  className="auth-link auth-back"
                  disabled={busy}
                  onClick={() => changeView('signin')}
                >
                  ← Voltar para entrar
                </button>
              )}
              {error && (
                <p className="auth-feedback auth-error" role="alert">
                  {error}
                </p>
              )}
              {success && (
                <p className="auth-feedback auth-success" role="status">
                  {success}
                </p>
              )}
              {import.meta.env.DEV && !firebaseConfigured && (
                <div className="auth-local">
                  <button type="button" onClick={useLocal}>
                    Continuar no modo local de desenvolvimento
                  </button>
                  <p>Sem login ou sincronização. Disponível somente durante o desenvolvimento.</p>
                </div>
              )}
            </>
          )}
          <p className="auth-storage-note">
            {import.meta.env.VITE_FINANCE_CLOUD_ENABLED === 'false'
              ? 'A sincronização está desativada neste ambiente. Os dados permanecem neste navegador.'
              : 'Sua conta mantém os dados financeiros privados na nuvem e uma cópia neste navegador. Arquivos de comprovantes permanecem locais.'}
          </p>
        </div>
      </section>
    </main>
  );
}
