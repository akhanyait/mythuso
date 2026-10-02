import { Gift } from 'lucide-react';
import { welcome, images, products, refusals } from '../../../../packages/catalog/shop.json';
import './welcome-device.css';

/* The welcome monitor, on the first step of sign-up. It arrives on a dynamic import when that step
   opens, so the patient's first load — held to a ceiling by scripts/check-bundle-budget.mjs — pays
   nothing for a picture and five sentences most people will read once. Every word is the shop
   contract's: the label says it is a planned offer, and the refusal under it says nobody can claim it,
   because the sign-up this screen draws is not live. */
export default function WelcomeDevice() {
 const monitor = products.find(p => p.id === welcome.productId)!;
 const notLive = refusals.find(r => r.id === 'welcome-not-live')!.sentence;
 return <aside className="welcome-device" aria-labelledby="welcome-device-heading">
  <figure>
   <img src={`${images.dir}${monitor.id}${images.small.suffix}.webp`} width={images.small.width} height={images.small.height} alt={monitor.image.alt} loading="lazy" decoding="async"/>
   <figcaption>{images.label}</figcaption>
  </figure>
  <div>
   <span className="welcome-device-label"><Gift size={14} aria-hidden="true"/>{welcome.label}</span>
   <h2 id="welcome-device-heading">{welcome.headline}</h2>
   <p>{welcome.intro}</p>
   <p className="welcome-device-refusal">{notLive}</p>
   <a href={`/shop/#product/${monitor.id}`}>What it reads, and who sees it</a>
  </div>
 </aside>;
}
