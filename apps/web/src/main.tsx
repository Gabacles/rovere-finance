import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function App() {
  return (
    <main>
      <span className="brand">ROVERE FINANCE</span>
      <h1>Clareza para cuidar<br />do seu dinheiro.</h1>
      <p>Suas contas, compras e planos em um só lugar.</p>
      <section aria-labelledby="development-title">
        <span className="badge">Em desenvolvimento</span>
        <h2 id="development-title">Estamos preparando a primeira versão.</h2>
        <p>O cadastro de movimentações e a importação de arquivos estarão disponíveis nas próximas entregas.</p>
      </section>
      <footer>Organização hoje. Tranquilidade amanhã.</footer>
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Application root not found.');
createRoot(root).render(<StrictMode><App /></StrictMode>);
