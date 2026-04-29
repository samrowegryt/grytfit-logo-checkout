export default async function handler(req, res) {
  return res.status(200).send(`
    <html>
      <body style="font-family: Arial, sans-serif; padding: 40px;">
        <h1>GrytFit app installed</h1>
        <p>You can close this tab and return to Shopify.</p>
      </body>
    </html>
  `);
}
