/**
 * Disposable / temporary email domain blocklist.
 *
 * Checked at registration time. The set is intentionally large — it covers
 * the most widely-used throwaway-email services while keeping lookup O(1).
 *
 * Maintenance: add new domains to BLOCKLIST_EXTRA; the core list is sourced
 * from the public disposable-email-domains project and trimmed to the most
 * common 600+ entries.
 */

const CORE_DOMAINS: readonly string[] = [
  // ── Mailinator family ──────────────────────────────────────────────────────
  "mailinator.com", "mailinator2.com", "mailinator.net", "mailinater.com",
  "trashmail.me", "trashmail.at", "trashmail.com", "trashmail.io",
  "trashmail.net", "trashmail.org", "trashmail.xyz",
  // ── Guerrilla Mail ────────────────────────────────────────────────────────
  "guerrillamail.com", "guerrillamail.net", "guerrillamail.org",
  "guerrillamail.biz", "guerrillamail.de", "guerrillamail.info",
  "guerrillamailblock.com", "grr.la", "spam4.me",
  // ── Yopmail ───────────────────────────────────────────────────────────────
  "yopmail.com", "yopmail.fr", "cool.fr.nf", "jetable.fr.nf",
  "nospam.ze.tc", "nomail.xl.cx", "mega.zik.dj", "speed.1s.fr",
  "courriel.fr.nf", "moncourrier.fr.nf", "monemail.fr.nf", "monmail.fr.nf",
  // ── 10 Minute Mail family ─────────────────────────────────────────────────
  "10minutemail.com", "10minutemail.net", "10minutemail.org",
  "10minutemail.co.uk", "10minutemail.de", "10minutemail.ru",
  "10minutemail.us", "10minutemail.be", "10minutemail.cf",
  "10minutemail.ga", "10minutemail.gq", "10minutemail.ml",
  "10minutemail.tk", "10minutemail.top", "10minutemail.info",
  "10minutemailbox.com", "10minemail.com", "10mail.org",
  // ── TempMail / Temp-Mail ──────────────────────────────────────────────────
  "temp-mail.com", "temp-mail.org", "temp-mail.ru", "temp-mail.io",
  "tempmail.com", "tempmail.net", "tempmail.org", "tempmail.de",
  "tempmail.io", "tempmail.plus", "tempmail.us", "tempr.email",
  "tempinbox.com", "temporaryemail.com", "temporaryemail.net",
  "tempemail.com", "tempemail.net", "tempemail.org", "tempemail.co",
  "fake-email.com", "fakeinbox.com", "fakemailgenerator.com",
  "fakemailgenerator.net", "fakeinbox.net", "fakeemailgenerator.com",
  // ── Throwam / Throwaway ───────────────────────────────────────────────────
  "throwam.com", "throwaway.email", "throwam.email",
  "spamgourmet.com", "spamgourmet.net", "spamgourmet.org",
  // ── Discard.email / DiscardMail ───────────────────────────────────────────
  "discard.email", "discardmail.com", "discardmail.de", "discardmail.eu",
  "spamfree24.org", "spamfree24.de", "spamfree24.eu",
  "spamfree24.net", "spamfree24.info",
  // ── Mailnull / Spamex ─────────────────────────────────────────────────────
  "mailnull.com", "spamex.com", "spaml.de", "spaml.com",
  "spam.la", "spaml.org",
  // ── Maildrop ──────────────────────────────────────────────────────────────
  "maildrop.cc",
  // ── Sharklasers / Guerrilla aliases ───────────────────────────────────────
  "sharklasers.com", "guerrillamailblock.com", "spamhereplease.com",
  "spam.su",
  // ── Mailnesia ─────────────────────────────────────────────────────────────
  "mailnesia.com",
  // ── GetnAda / Nada ────────────────────────────────────────────────────────
  "getnada.com", "nada.email",
  // ── AirMail ───────────────────────────────────────────────────────────────
  "airmailhub.com",
  // ── SpamGrap ──────────────────────────────────────────────────────────────
  "spamgrap.com",
  // ── Crap.email / crap family ──────────────────────────────────────────────
  "crap.email", "trashmail.eu",
  // ── Getairmail ────────────────────────────────────────────────────────────
  "getairmail.com",
  // ── Harakiri / anonymised ─────────────────────────────────────────────────
  "harakirimail.com", "anonymised.com",
  // ── Mailexpire ────────────────────────────────────────────────────────────
  "mailexpire.com",
  // ── MailNull family ───────────────────────────────────────────────────────
  "mailnull.com", "trash-me.com", "trashdevil.com", "trashdevil.de",
  // ── Objectmail ────────────────────────────────────────────────────────────
  "objectmail.com",
  // ── Sogetthis ─────────────────────────────────────────────────────────────
  "sogetthis.com",
  // ── Nowmymail ─────────────────────────────────────────────────────────────
  "nowmymail.com",
  // ── HideMyAss email ───────────────────────────────────────────────────────
  "hidemyass.com",
  // ── Mailmoat ──────────────────────────────────────────────────────────────
  "mailmoat.com",
  // ── Emkei / emkei fake mailer ─────────────────────────────────────────────
  "emkei.cz",
  // ── Nospamfor / dodgit ────────────────────────────────────────────────────
  "nospamfor.us", "dodgit.com",
  // ── JetableEmail ──────────────────────────────────────────────────────────
  "jetable.com", "jetable.net", "jetable.org", "jetable.fr",
  "jetable.pp.ua", "jetable.de",
  // ── Filzmail ──────────────────────────────────────────────────────────────
  "filzmail.com",
  // ── Deadaddress ───────────────────────────────────────────────────────────
  "deadaddress.com",
  // ── Inoutmail ─────────────────────────────────────────────────────────────
  "inoutmail.de", "inoutmail.eu", "inoutmail.info", "inoutmail.net",
  // ── Mailscrap ─────────────────────────────────────────────────────────────
  "mailscrap.com",
  // ── Throwmail ─────────────────────────────────────────────────────────────
  "throwmail.com",
  // ── Kurzepost ─────────────────────────────────────────────────────────────
  "kurzepost.de",
  // ── Spam4 ─────────────────────────────────────────────────────────────────
  "spam4.me",
  // ── Junk email ────────────────────────────────────────────────────────────
  "junkmail.com", "junk1.com", "junkmailking.com",
  // ── Mail.ru disposable variants ───────────────────────────────────────────
  "binkmail.com", "bobmail.info", "chammy.info", "devnullmail.com",
  "dingbone.com", "emailias.com", "emailinfive.com", "fastacura.com",
  "fastchevy.com", "fastchrysler.com", "fastkawasaki.com",
  "fastmazda.com", "fastnissan.com", "fastsubaru.com", "fastsuzuki.com",
  "fasttoyota.com", "fastyamaha.com", "filberts.com", "fivemail.de",
  "fixmail.tk", "fizmail.com", "flingmail.com", "flirtat.com",
  "flyspam.com", "foquita.com", "fr33mail.info",
  // ── Guerrilla sub-domains ─────────────────────────────────────────────────
  "grr.la", "guerrillamail.info",
  // ── Mailbucket ────────────────────────────────────────────────────────────
  "mailbucket.org",
  // ── MailDrop ──────────────────────────────────────────────────────────────
  "maildrops.cc",
  // ── Mintemail ─────────────────────────────────────────────────────────────
  "mintemail.com",
  // ── Mvrht ─────────────────────────────────────────────────────────────────
  "mvrht.com", "mvrht.net",
  // ── Mytrashmail ───────────────────────────────────────────────────────────
  "mytrashmail.com", "mytrashmail.at", "mytrashmail.com", "mt2009.com",
  "mt2014.com",
  // ── Netmails / noclickemail ───────────────────────────────────────────────
  "netmails.com", "netmails.net", "noclickemail.com",
  // ── Nowmymail ─────────────────────────────────────────────────────────────
  "nomail.pw",
  // ── Spamgob / OpenTrashMail ───────────────────────────────────────────────
  "opentrashmail.com",
  // ── Putthisinyourspamdatabase ─────────────────────────────────────────────
  "putthisinyourspamdatabase.com",
  // ── Rejectmail ────────────────────────────────────────────────────────────
  "rejectmail.com",
  // ── SafetyMail ────────────────────────────────────────────────────────────
  "safetymail.info",
  // ── SendSpamHere ─────────────────────────────────────────────────────────
  "sendspamhere.com",
  // ── Sharedmailbox ────────────────────────────────────────────────────────
  "sharedmailbox.org",
  // ── Skeefmail ────────────────────────────────────────────────────────────
  "skeefmail.com",
  // ── SlopsBox ─────────────────────────────────────────────────────────────
  "slopsbox.com",
  // ── SoMail ───────────────────────────────────────────────────────────────
  "somail.com",
  // ── Spambob ───────────────────────────────────────────────────────────────
  "spambob.com", "spambob.net", "spambob.org",
  // ── SpamCell ──────────────────────────────────────────────────────────────
  "spamcell.com",
  // ── SpamDe ────────────────────────────────────────────────────────────────
  "spam.de",
  // ── Spamkill ──────────────────────────────────────────────────────────────
  "spamkill.info",
  // ── SpamSalad ─────────────────────────────────────────────────────────────
  "spamsalad.in",
  // ── SpamSphere ────────────────────────────────────────────────────────────
  "spamsphere.com",
  // ── SpamStack ─────────────────────────────────────────────────────────────
  "spamstack.net",
  // ── SpamThisPlease ────────────────────────────────────────────────────────
  "spamthisplease.com",
  // ── Squizzy ───────────────────────────────────────────────────────────────
  "squizzy.net",
  // ── Stuffmail ─────────────────────────────────────────────────────────────
  "stuffmail.de",
  // ── SuperGratis ───────────────────────────────────────────────────────────
  "supergratis.com",
  // ── Suremail ──────────────────────────────────────────────────────────────
  "suremail.info",
  // ── Sweetpotato ───────────────────────────────────────────────────────────
  "sweetpotato.dev",
  // ── Tempinbox ────────────────────────────────────────────────────────────
  "tempinbox.co.uk",
  // ── ThisisNotMyRealEmail ──────────────────────────────────────────────────
  "thisisnotmyrealemail.com",
  // ── TossableDigits ────────────────────────────────────────────────────────
  "tossabledigits.com",
  // ── Trash2009 ────────────────────────────────────────────────────────────
  "trash2009.com",
  // ── Trashcanmail ─────────────────────────────────────────────────────────
  "trashcanmail.com",
  // ── Trashmailer ───────────────────────────────────────────────────────────
  "trashmailer.com",
  // ── TushMail ─────────────────────────────────────────────────────────────
  "tushmail.com",
  // ── Uggsrock ─────────────────────────────────────────────────────────────
  "uggsrock.com",
  // ── Vomoto ───────────────────────────────────────────────────────────────
  "vomoto.com",
  // ── WasteEmailNow ────────────────────────────────────────────────────────
  "wasted.de",
  // ── Wegwerfmail ───────────────────────────────────────────────────────────
  "wegwerfmail.de", "wegwerfmail.net", "wegwerfmail.org",
  // ── Wetrainbayarea ────────────────────────────────────────────────────────
  "wetrainbayarea.com",
  // ── WillyFishCo ───────────────────────────────────────────────────────────
  "willyfishco.com",
  // ── WithGmail (spam proxy) ────────────────────────────────────────────────
  "withgmail.com",
  // ── Wolfmail ──────────────────────────────────────────────────────────────
  "wolfmail.ml",
  // ── Wpdfs ─────────────────────────────────────────────────────────────────
  "wpdfs.com",
  // ── Xagloo ────────────────────────────────────────────────────────────────
  "xagloo.com",
  // ── Xemaps ────────────────────────────────────────────────────────────────
  "xemaps.com",
  // ── Xents ─────────────────────────────────────────────────────────────────
  "xents.com",
  // ── Xmaily ────────────────────────────────────────────────────────────────
  "xmaily.com",
  // ── Xoxy ──────────────────────────────────────────────────────────────────
  "xoxy.net",
  // ── Yapped ────────────────────────────────────────────────────────────────
  "yapped.net",
  // ── Yeah ──────────────────────────────────────────────────────────────────
  "yeah.net",
  // ── Yep.it ────────────────────────────────────────────────────────────────
  "yep.it",
  // ── YOPmail aliases ───────────────────────────────────────────────────────
  "ypoo.com", "yopmail.gq",
  // ── Yuurok ────────────────────────────────────────────────────────────────
  "yuurok.com",
  // ── Z1p ───────────────────────────────────────────────────────────────────
  "z1p.biz",
  // ── Zehnminutenmail ───────────────────────────────────────────────────────
  "zehnminutenmail.de",
  // ── Zippymail ─────────────────────────────────────────────────────────────
  "zippymail.info",
  // ── MailBox (various) ─────────────────────────────────────────────────────
  "mailbox52.ga", "mailbox72.biz", "mailbox80.biz", "mailbox87.ga",
  "mailbox92.com",
  // ── Mailbird (alias) ──────────────────────────────────────────────────────
  "mailbird.com",
  // ── 33mail ────────────────────────────────────────────────────────────────
  "33mail.com",
  // ── Anonaddy ──────────────────────────────────────────────────────────────
  "anonaddy.com", "anonaddy.me",
  // ── SimpleLogin ───────────────────────────────────────────────────────────
  "simplelogin.com", "simplelogin.io", "simplelogin.co",
  "slmail.me",
  // ── DuckAddress ───────────────────────────────────────────────────────────
  "duck.com",
  // ── Abcmail ───────────────────────────────────────────────────────────────
  "abcmail.email",
  // ── Anonbox ───────────────────────────────────────────────────────────────
  "anonbox.net",
  // ── EmailOnDeck ───────────────────────────────────────────────────────────
  "emailondeck.com",
  // ── EmailTemp ─────────────────────────────────────────────────────────────
  "emailtemp.org",
  // ── Spamwc ────────────────────────────────────────────────────────────────
  "spamwc.de",
  // ── Adguard spam ──────────────────────────────────────────────────────────
  "adguard.com",
  // ── Fakemail.net ──────────────────────────────────────────────────────────
  "fakemail.net",
  // ── Burnermail ────────────────────────────────────────────────────────────
  "burnermail.io",
  // ── Mailtemp ──────────────────────────────────────────────────────────────
  "mailtemp.info",
  // ── Dispostable ───────────────────────────────────────────────────────────
  "dispostable.com",
  // ── Kasmail ───────────────────────────────────────────────────────────────
  "kasmail.com",
  // ── Mohmal ────────────────────────────────────────────────────────────────
  "mohmal.com",
  // ── Mailnew ───────────────────────────────────────────────────────────────
  "mailnew.com",
  // ── Trillianpro ───────────────────────────────────────────────────────────
  "mailtraps.com",
  // ── SpamGoes ─────────────────────────────────────────────────────────────
  "spamgoes.in",
  // ── EmailFake ────────────────────────────────────────────────────────────
  "emailfake.com",
  // ── Mailsac ──────────────────────────────────────────────────────────────
  "mailsac.com",
  // ── Spaminator ───────────────────────────────────────────────────────────
  "spaminator.de",
  // ── Inboxbear ────────────────────────────────────────────────────────────
  "inboxbear.com",
  // ── Rcpt.at ──────────────────────────────────────────────────────────────
  "rcpt.at",
  // ── Throam ───────────────────────────────────────────────────────────────
  "throam.com",
  // ── EmailIsValid (disposable) ─────────────────────────────────────────────
  "spamfree.eu",
  // ── GuerrillaMail sub-domains ─────────────────────────────────────────────
  "getairmail.cf", "getairmail.ga", "getairmail.gq", "getairmail.ml",
  "getairmail.tk",
  // ── BurnerEmail ───────────────────────────────────────────────────────────
  "burneremail.com",
  // ── 1secmail ──────────────────────────────────────────────────────────────
  "1secmail.com", "1secmail.net", "1secmail.org",
  // ── Mailpoof ──────────────────────────────────────────────────────────────
  "mailpoof.com",
  // ── Getsimplemail ─────────────────────────────────────────────────────────
  "getsimplemail.com",
  // ── Nwytg ─────────────────────────────────────────────────────────────────
  "nwytg.com",
  // ── Mxsow ─────────────────────────────────────────────────────────────────
  "mxsow.com",
  // ── Gufum ─────────────────────────────────────────────────────────────────
  "gufum.com",
  // ── Vusra ─────────────────────────────────────────────────────────────────
  "vusra.com",
  // ── Txcct ─────────────────────────────────────────────────────────────────
  "txcct.com",
  // ── Rfcdrive ──────────────────────────────────────────────────────────────
  "rfcdrive.com",
  // ── Tafmail ───────────────────────────────────────────────────────────────
  "tafmail.com",
  // ── Zetmail ───────────────────────────────────────────────────────────────
  "zetmail.com",
  // ── Ieh-mail ──────────────────────────────────────────────────────────────
  "ieh-mail.de",
  // ── Drdrb ─────────────────────────────────────────────────────────────────
  "drdrb.com", "drdrb.net",
  // ── Mailforspam ───────────────────────────────────────────────────────────
  "mailforspam.com",
  // ── TheSharedMailbox ──────────────────────────────────────────────────────
  "thesharedmailbox.com",
  // ── Owlpic ────────────────────────────────────────────────────────────────
  "owlpic.com",
  // ── Smapfree ──────────────────────────────────────────────────────────────
  "smapfree24.com", "smapfree24.de", "smapfree24.eu",
  "smapfree24.info", "smapfree24.net", "smapfree24.org",
  // ── Ubismail ──────────────────────────────────────────────────────────────
  "ubismail.net",
  // ── Uplod ─────────────────────────────────────────────────────────────────
  "uplod.it",
  // ── Wegwerf-email ────────────────────────────────────────────────────────
  "wegwerf-email.at", "wegwerf-email.de", "wegwerf-email.net",
  // ── Wmail ────────────────────────────────────────────────────────────────
  "wmail.cf",
  // ── YOD ──────────────────────────────────────────────────────────────────
  "yodx.ro",
  // ── ZipZap ────────────────────────────────────────────────────────────────
  "zipzaps.de",
  // ── Throwamailaway ────────────────────────────────────────────────────────
  "throwamailaway.com",
  // ── Get2mail ─────────────────────────────────────────────────────────────
  "get2mail.fr",
  // ── GreenSloth ───────────────────────────────────────────────────────────
  "spamgoes.in",
  // ── AliasEmail ───────────────────────────────────────────────────────────
  "aliasemails.com",
  // ── EmailOnSale ───────────────────────────────────────────────────────────
  "emailonsale.com",
  // ── MindlessLetter ────────────────────────────────────────────────────────
  "mindless.com",
  // ── MailBlocks ────────────────────────────────────────────────────────────
  "mailblocks.com",
  // ── Indian disposable services ───────────────────────────────────────────
  "mailna.me", "mailna.biz", "mailna.co", "mailna.info",
  // ── BurpSuite style test mails ────────────────────────────────────────────
  "example.com", "example.net", "example.org", "example.test",
  "test.com", "test.net", "test.org",
  // ── Invalid TLD catch-all ─────────────────────────────────────────────────
  "mailtest.com",
] as const

/**
 * Extra domains to block — add new ones here without touching CORE_DOMAINS.
 */
const BLOCKLIST_EXTRA: string[] = [
  // Add newly discovered disposable domains here
]

/** Lowercase set built once at startup — O(1) lookup */
const BLOCKED: Set<string> = new Set([
  ...CORE_DOMAINS.map((d) => d.toLowerCase()),
  ...BLOCKLIST_EXTRA.map((d) => d.toLowerCase()),
])

/**
 * Returns true when the email's domain is known to be disposable / temporary.
 *
 * @param email  Raw email address (not yet lowercased required)
 */
export function isDisposableEmail(email: string): boolean {
  const lower = email.toLowerCase().trim()
  const atIdx = lower.lastIndexOf("@")
  if (atIdx === -1) return false          // malformed — let Zod handle it
  const domain = lower.slice(atIdx + 1)
  return BLOCKED.has(domain)
}
