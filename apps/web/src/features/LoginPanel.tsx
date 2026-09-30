import { Modal } from '../components/UI';
import { figureFor, slides } from '../lib/hero';
import heroContract from '../../../../packages/catalog/hero.json';
import { RolePanel } from './DemoLogin';
import './LoginPanel.css';

/* The public page's way in, in the handoff's two columns since 30 September 2026: a brand column on the
   left and the role picker on the right, the column shown only where there is room for it beside the
   picker. The handoff's column spoke of secure access and signing in; there are no accounts, so its words
   are hero.json's `stage.login`, which say what the picker is. The picker is DemoLogin's, untouched — its
   accounts notice and its refusal come with it, word for word.

   The column is a light ground in either theme (the dialog is core.css's fixed --surface), so it wears the ink
   wordmark itself rather than Wordmark, whose reversed lockup follows the page's theme and would draw white
   letters on this light ground in the dark one.

   The figure is the hero's own cut-out, fetched lazily: the column is not drawn on a phone, and an image
   that is never drawn is never asked for. */
const words = heroContract.stage.login;
const figure = figureFor(slides[0]);

export default function LoginPanel({ onClose }: { onClose: () => void }) {
 return <Modal title="Log in to MyThuso" onClose={onClose} surface="central-login">
  <aside className="login-brand">
   <img className="login-brand-mark" src="/brand/mythuso-logo.svg" alt="MyThuso" width="366" height="98"/>
   <p className="login-brand-eyebrow">{words.eyebrow}</p>
   <p className="login-brand-headline">{words.headline.map((line, i) => <span key={line} className={i === words.headline.length - 1 ? 'is-accent' : undefined}>{line}</span>)}</p>
   <p className="login-brand-body">{words.body}</p>
   <span className="login-brand-halo" aria-hidden="true"><span/><span/></span>
   <picture className="login-brand-figure">
    <source srcSet={figure.srcSet} sizes="300px" type="image/webp"/>
    <img src={figure.fallback} alt="" width={figure.width} height={figure.height} loading="lazy" decoding="async"/>
   </picture>
   <img className="login-brand-guide" src="/lovable/gilbertone-logo-360.webp" alt="" width="360" height="270" loading="lazy" decoding="async"/>
  </aside>
  <div className="login-roles">
   <p className="muted">Choose your role to open its dashboard. Preview auto-login uses fictional profiles.</p>
   <RolePanel onPick={role => window.location.assign(`/?role=${role}`)}/>
  </div>
 </Modal>;
}
