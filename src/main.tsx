import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Il primo touch dell'utente e' il click su ENGAGE, che sblocca l'audio.
// Se il browser ripristina lo scroll mid-page (refresh durante l'esperienza),
// gli ScrollTrigger della pagina restaurata sparano setVolume(>0) su tutti i
// loop ambient della sezione corrente. Restano muti finche' siamo muted,
// ma al click di ENGAGE l'unmute() li trova con targetVolume>0 e li fa
// partire TUTTI in contemporanea. Forziamo scroll a top per ripartire
// pulito ogni refresh.
if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}
window.scrollTo(0, 0);

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
