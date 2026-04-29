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
    const accessToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

    if (!storeDomain || !accessToken) {
      return res.status(500).json({ error: "Missing Shopify environment variables" });
    }

    const lineItems = items.map((item, index) => ({
      title: `Custom Logo Decal #${index + 1}`,
      quantity: 1,
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

    const response = await fetch(`https://${storeDomain}/admin/api/2025-01/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          input: {
            lineItems,
            note: "Custom logo decal order created from GrytFit calculator"
          }
        }
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
    return res.status(500).json({ error: error.message });
  }
}
// deploy trigger
