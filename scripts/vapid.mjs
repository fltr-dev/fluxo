// Gera o par de chaves VAPID do Web Push. Use: node scripts/vapid.mjs
// Cole no ambiente (Vercel › Settings › Environment Variables): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT.
import webpush from "web-push"

const keys = webpush.generateVAPIDKeys()
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`)
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`)
console.log("VAPID_SUBJECT=mailto:seu-email@exemplo.com")
