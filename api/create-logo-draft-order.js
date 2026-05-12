import { put } from "@vercel/blob";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "25mb"
    }
  }
};

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
      return res.status(500).json({
        error: "Missing Shopify environment variables"
      });
    }

    const processedItems = [];

    for (const item of items) {
      let uploadedFileUrl = "";

      if (item.file && item.fileName) {
        const base64Data = item.file.split(",")[1];

        const buffer = Buffer.from(base64Data, "base64");

        const blob = await put(
          `logo-uploads/${Date.now()}-${item.fileName}`,
          buffer,
          {
            access: "public"
          }
        );

        uploadedFileUrl = blob.url;
      }

      processedItems.push({
        ...item,
        uploadedFileUrl
      });
    }

    const lineItems = processedItems.map((item, index) => ({
      title: item.productType
        ? `Custom ${item.productType} Logo Decal #${index + 1}`
        : `Custom Logo Decal #${index + 1}`,

      quantity: Number(item.quantity || 1),

      originalUnitPrice: String(
        Number(item.price).toFixed(2)
      ),

      requiresShipping: true,
      taxable: true,

      customAttributes: [
        { key: "Width", value: `${item.width} in` },
        { key: "Height", value: `${item.height} in` },
        { key: "Surface", value: String(item.surface || "") },
        { key: "Laminate", value: String(item.laminate || "") },
        { key: "Cut Style", value: String(item.cut || "") },
        { key: "Artwork Help", value: item.artwork ? "Yes" : "No" },
        { key: "Proof Email", value: String(item.proofEmail || "") },
        { key: "Notes", value: String(item.notes || "") },
        {
          key: "Artwork File",
          value: item.uploadedFileUrl || "No file uploaded"
        }
      ]
    }));

    const orderNotes = processedItems
      .map((item, index) => {
        return `
ITEM ${index + 1}

Size:
${item.width}" × ${item.height}"

Surface:
${item.surface}

Cut Style:
${item.cut}

Laminate:
${item.laminate}

Proof Email:
${item.proofEmail || "N/A"}

Artwork Help:
${item.artwork ? "Yes" : "No"}

Customer Notes:
${item.notes || "None"}

Artwork File:
${item.uploadedFileUrl || "No upload"}
`;
      })
      .join("\n-----------------\n");

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

    const response = await fetch(
      `https://${storeDomain}/admin/api/2026-04/graphql.json`,
      {
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

              shippingLine: {
                title: "Free Shipping",
                price: "0.00"
              },

              note: orderNotes
            }
          }
        })
      }
    );

    const data = await response.json();

    const errors =
      data?.data?.draftOrderCreate?.userErrors;

    if (errors && errors.length > 0) {
      return res.status(400).json({ error: errors });
    }

    const invoiceUrl =
      data?.data?.draftOrderCreate?.draftOrder
        ?.invoiceUrl;

    if (!invoiceUrl) {
      return res.status(500).json({
        error: "No invoice URL returned",
        data
      });
    }

    await resend.emails.send({
      from: "orders@grytfit.com",
      to: "support@grytfit.com",
      subject: "New Custom Logo Order",

      html: `
        <h2>New Custom Logo Order</h2>

        <p>
          A new custom logo decal order was submitted.
        </p>

        <pre>${orderNotes}</pre>

        <p>
          Shopify Invoice:
          <a href="${invoiceUrl}">
            ${invoiceUrl}
          </a>
        </p>
      `
    });

    return res.status(200).json({
      invoiceUrl
    });
  } catch (error) {
    console.error("DRAFT_ORDER_ERROR:", error);

    return res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
}
