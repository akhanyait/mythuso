# Moving mythuso.co.za onto Cloudflare

`mythuso.co.za.zone` is the whole zone as it was serving on 7 September 2026, with one change: the
website records move from the registrar's parking page to the server the app is deployed on. Import
it rather than retyping records — this domain carries a live mail server, and the failure mode of a
missed record is that mail stops and nobody notices until somebody says they emailed you last week.

## Order

1. **Cloudflare → Add a site → `mythuso.co.za`.** Choose the free plan.
2. **Import DNS records** and upload `mythuso.co.za.zone`. Cloudflare's scan will also try to find
   records itself; the import is the one to trust, because it was taken from the authoritative
   nameservers rather than guessed.
3. **Check the proxy status of every row before continuing.**
   - `mythuso.co.za` and `www` — **grey cloud (DNS only)** for now. Turn the orange cloud on later,
     after the certificate exists.
   - `mail`, `webmail`, `smtp`, `imap`, `pop` — **grey cloud, permanently.** Cloudflare proxies HTTP.
     It does not proxy SMTP or IMAP, and an orange cloud on any of these stops mail reaching you.
4. **Change the nameservers at domains.co.za** to the pair Cloudflare shows you. It is the pair, not
   a guess: bidza.co.za and artisanza.co.za already use `zara`/`santino`, and a new zone on the same
   account usually gets the same two, but take them from the screen.
5. **Wait.** `dig +short NS mythuso.co.za` until it answers `*.ns.cloudflare.com`.
6. **Publish**: `./deploy/deploy.sh`
7. **Certificate**: `ssh liqzar-server "certbot --nginx -d mythuso.co.za -d www.mythuso.co.za"`
8. **Then**, if you want Cloudflare in front of it: turn the orange cloud on for `mythuso.co.za` and
   `www`, and set SSL/TLS mode to **Full (strict)**. Not Flexible — Flexible sends Cloudflare to your
   server over plain http, which is a redirect loop waiting to happen and an unencrypted hop for a
   health service's traffic. Full (strict) works because step 7 gave the origin a real certificate.

## Check afterwards

```
dig +short mythuso.co.za            # 154.66.198.238, or a Cloudflare address once proxied
dig +short MX mythuso.co.za         # 10 mx1.tld-mx.com — unchanged
dig +short TXT mythuso.co.za        # the SPF record — unchanged
```

And send yourself an email before telling anyone the site is live. DNS says the mail server is
reachable; only a delivered message says the mail still works.
