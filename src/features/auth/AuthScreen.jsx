import React, { useState } from 'react';
import { useAuth } from './AuthProvider.jsx';
import { firebaseConfigured } from '../../infrastructure/firebase/client.js';
import './auth.css';

export function AuthScreen() {
  const { loading, signInGoogle, enterLocalMode, configError } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const disabled = !firebaseConfigured || Boolean(configError) || busy || loading;
  async function google() {
    if (disabled) return;
    setBusy(true);
    setError('');
    try {
      await signInGoogle();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
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
          <h2>Bom ter você por aqui.</h2>
          <p className="auth-description">
            Entre com sua conta Google. No primeiro acesso, seu perfil é criado automaticamente.
          </p>
          {loading ? (
            <p className="auth-loading" role="status">
              Verificando sua sessão…
            </p>
          ) : (
            <>
              {!firebaseConfigured && (
                <p className="auth-feedback auth-setup" role="status">
                  O login estará disponível quando o Firebase for configurado.
                </p>
              )}
              {configError && (
                <p className="auth-feedback auth-error" role="alert">
                  {configError}
                </p>
              )}
              <button type="button" className="auth-google" disabled={disabled} onClick={google}>
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
                {busy ? 'Conectando…' : 'Continuar com Google'}
              </button>
              {error && (
                <p className="auth-feedback auth-error" role="alert">
                  {error}
                </p>
              )}
              {import.meta.env.DEV && !firebaseConfigured && (
                <div className="auth-local">
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        enterLocalMode();
                      } catch (err) {
                        setError(err.message);
                      }
                    }}
                  >
                    Continuar no modo local de desenvolvimento
                  </button>
                  <p>Disponível somente durante o desenvolvimento.</p>
                </div>
              )}
            </>
          )}
          <p className="auth-storage-note">
            Seus dados financeiros ficam privados na sua conta. Convites são vinculados ao e-mail da
            conta Google após seu aceite.
          </p>
        </div>
      </section>
    </main>
  );
}
