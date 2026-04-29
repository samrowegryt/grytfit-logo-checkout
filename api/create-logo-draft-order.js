let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getShopifyAccessToken() {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (!storeDomain || !clientId || !clientSecret) {
    throw new Error("Missing Shopify environment variables");
  }

  const now = Date.now();

  if (cachedToken && cachedTokenExpiresAt > now + 60000) {
    return cachedToken;
  }

  const shopName = storeDomain.replace(".myshopify.com", "");

  const response = await fetch(`https://${shopName}.myshopify.com/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret
    })
  });

   const rawText = await response.text();

  let data;
  try {
    data = JSON.parse(rawText);
  } catch (parseError) {
    throw new Error(
      "Shopify token endpoint returned non-JSON. Status: " +
      response.status +
      ". First 300 chars: " +
      rawText.slice(0, 300)
    );
  }

  if (!response.ok || !data.access_token) {
    throw new Error("Could not get Shopify access token: " + JSON.stringify(data));
  }

  cachedToken = data.access_token;
  cachedTokenExpiresAt = Date.now() + ((data.expires_in || 86399) * 1000);

  return cachedToken;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "No items provided" });
    }

    const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
    const accessToken = await getShopifyAccessToken();

    const lineItems = items.map((item, index) => ({
      title: item.productType
        ? `Custom ${item.productType} Logo Decal #${index + 1}`
        : `Custom Logo Decal #${index + 1}`,
      quantity: Number(item.quantity || 1),
      originalUnitPrice: String(Number(item.price).toFixed(2)),
      customAttributes: [
        { key: "Width", value: `${item.width} in` },
        { key: "Height", value: `${item.height} in` },
        { key: "Surface", value: String(item.surface || "") },
        { key: "Laminate", value: String(item.laminate || "") },
        { key: "Cut Style", value: String(item.cut || "") },
        { key: "Artwork Help", value: item.artwork ? "Yes" : "No" },
        { key: "Notes", value: String(item.notes || "") }
      ]
    }));

    const mutation = `
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            invoiceUrl
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

     const response = await fetch(`https://${shopName}.myshopify.com/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret
    })
  });

    const data = await response.json();

    const errors = data?.data?.draftOrderCreate?.userErrors;
    if (errors && errors.length > 0) {
      return res.status(400).json({ error: errors });
    }

    const invoiceUrl = data?.data?.draftOrderCreate?.draftOrder?.invoiceUrl;

    if (!invoiceUrl) {
      return res.status(500).json({ error: "No invoice URL returned", data });
    }

    return res.status(200).json({ invoiceUrl });
    } catch (error) {
    console.error("DRAFT_ORDER_ERROR:", error);
    return res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
}
