export async function mailLink(email, subject) {
  const base = process.env.MAILPIT_URL ?? 'http://127.0.0.1:18025';
  for (let attempt = 0; attempt < 60; attempt++) {
    const list = await (await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
    const item = list.messages?.find(message => message.Subject.includes(subject));
    if (item) {
      const mail = await (await fetch(`${base}/api/v1/message/${item.ID}`)).json();
      const link = mail.Text.match(/https?:\/\/[^\s]+/);
      if (link) return link[0];
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Mail not delivered: ${subject}`);
}
