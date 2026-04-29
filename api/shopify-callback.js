export default async function handler(req, res) {
  const { code, shop } = req.query;

  if (!code || !shop) {
    return res.status(400).send("Missing code or shop.");
  }

  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
      code
    })
  });

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    return res.status(500).send(`
      <h1>Token exchange failed</h1>
      <pre>${JSON.stringify(data, null, 2)}</pre>
    `);
  }

  return res.status(200).send(`
    <html>
      <body style="font-family: Arial, sans-serif; padding: 40px;">
        <h1>Copy this token</h1>
        <p>Paste it into Vercel as <strong>SHOPIFY_ADMIN_ACCESS_TOKEN</strong>.</p>
        <textarea style="width:100%;height:140px;">${data.access_token}</textarea>
      </body>
    </html>
  `);
}
