require('dotenv').config();
const express = require('express');
const client = require('./db');
const cors = require('cors');
const OpenAI = require('openai');
const OAuthClient = require('intuit-oauth');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const app = express();
app.use(cors());
app.set('json spaces', 2);
app.use(express.json());

const quickbooksOAuth = new OAuthClient({
  clientId: process.env.QUICKBOOKS_CLIENT_ID,
  clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET,
  environment: 'sandbox',
  redirectUri: 'http://localhost:3000/api/quickbooks/callback'
});

app.get('/api/quickbooks/connect', (req, res) => {
  const authUri = quickbooksOAuth.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state: 'demo'
  });

  res.redirect(authUri);
});

let quickbooksToken = null;
let quickbooksRealmId = null;

app.get('/api/quickbooks/callback', async (req, res) => {
  try {
    const authResponse = await quickbooksOAuth.createToken(req.url);

    quickbooksToken = authResponse.token;
    quickbooksRealmId = authResponse.token.realmId;

    console.log('QuickBooks connected!');
    console.log('Realm ID:', quickbooksRealmId);

    res.send('QuickBooks connected successfully!');
  } catch (error) {
    console.error('QuickBooks OAuth error:', error);
    res.status(500).send('QuickBooks connection failed.');
  }
});

app.get('/api/quickbooks/company', async (req, res) => {
  if (!quickbooksToken) {
    return res.status(401).json({
      error: 'QuickBooks is not connected. Please connect first.'
    });
  }

  try {
    const response = await fetch(
      `https://sandbox-quickbooks.api.intuit.com/v3/company/${quickbooksRealmId}/companyinfo/${quickbooksRealmId}`,
      {
        headers: {
          Authorization: `Bearer ${quickbooksToken.access_token}`,
          Accept: 'application/json'
        }
      }
    );

    const data = await response.json();

    res.json(data);

  } catch (error) {
    console.error('QuickBooks API error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/quickbooks/transactions/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;

    const result = await client.query(`
      SELECT *
      FROM quickbooks_transactions
      WHERE client_id = $1
      ORDER BY transaction_date DESC
    `, [clientId]);

    res.json(result.rows);
  } catch (error) {
    console.error('QuickBooks database error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/quickbooks/transactions/auto-categorize', async (req, res) => {
  try {
      if (!quickbooksToken) {
    return res.status(401).json({
      error: 'QuickBooks is not connected. Please connect first.'
    });
    }
    const { clientId } = req.query;
    const query = encodeURIComponent(
      'SELECT * FROM Purchase'
    );

    const response = await fetch(
      `https://sandbox-quickbooks.api.intuit.com/v3/company/${quickbooksRealmId}/query?query=${query}`,
      {
        headers: {
          Authorization: `Bearer ${quickbooksToken.access_token}`,
          Accept: 'application/json'
        }
      }
    );

    const data = await response.json();

    const purchases = data.QueryResponse?.Purchase || [];

    const categoriesResult = await client.query(
      'SELECT name FROM categories ORDER BY name'
    );

    const categories = categoriesResult.rows.map(row => row.name);

    const mappedTransactions = purchases.map((purchase) => ({
      quickbooksId: purchase.Id,
      date: purchase.TxnDate,
      payee: purchase.EntityRef?.name || 'Unknown',
      amount: purchase.TotalAmt,
      paymentType: purchase.PaymentType,
      account: purchase.AccountRef?.name || 'Unknown',
      memo: purchase.PrivateNote || null,

      description: purchase.Line
        ?.map((line) => line.Description)
        .filter(Boolean)
        .join(', ') || null,

      lineItems: purchase.Line?.map((line) => ({
        description: line.Description || null,
        amount: line.Amount
      })) || [],

      quickbooksAccountOrItem:
        purchase.Line?.[0]?.AccountBasedExpenseLineDetail?.AccountRef?.name
        || purchase.Line?.[0]?.ItemBasedExpenseLineDetail?.ItemRef?.name
        || null
    }));

    for (const transaction of mappedTransactions) {
      const response = await openai.responses.create({
        model: 'gpt-5-mini',
        input: `
You are categorizing a bookkeeping transaction.

Transaction:

Payee: ${transaction.payee}

Description: ${transaction.description || 'None'}

Memo: ${transaction.memo || 'None'}

Amount: ${transaction.amount}

QuickBooks Account or Item: ${transaction.quickbooksAccountOrItem || 'None'}

Line Items: ${JSON.stringify(transaction.lineItems || [])}

Approved categories:

${categories.join(', ')}

Choose exactly ONE category from the approved categories.

Return:
- category
- confidence
- reason

Confidence must be a number between 0 and 1.

Do not invent a category.
        `,
        text: {
          format: {
            type: 'json_schema',
            name: 'transaction_category',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                category: {
                  type: 'string',
                  enum: categories
                },
                confidence: {
                  type: 'number',
                  minimum: 0,
                  maximum: 1
                },
                reason: {
                  type: 'string'
                }
              },
              required: ['category', 'confidence', 'reason'],
              additionalProperties: false
            }
          }
        }
      });

      const aiResult = JSON.parse(response.output_text);

      transaction.category = aiResult.category;
      transaction.confidence = aiResult.confidence;
      transaction.reason = aiResult.reason;

      await client.query(
      `INSERT INTO quickbooks_transactions (
        quickbooks_id,
        client_id,
        transaction_date,
        payee,
        amount,
        payment_type,
        account,
        memo,
        description,
        line_items,
        quickbooks_account_or_item,
        category,
        confidence,
        reason
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (client_id, quickbooks_id)
      DO UPDATE SET
        client_id = EXCLUDED.client_id,
        category = EXCLUDED.category,
        confidence = EXCLUDED.confidence,
        reason = EXCLUDED.reason`,
      [
        transaction.quickbooksId,
        clientId,
        transaction.date,
        transaction.payee,
        transaction.amount,
        transaction.paymentType,
        transaction.account,
        transaction.memo,
        transaction.description,
        JSON.stringify(transaction.lineItems),
        transaction.quickbooksAccountOrItem,
        transaction.category,
        transaction.confidence,
        transaction.reason
      ]
    );
    }

    const savedTransactions = await client.query(
      `SELECT *
      FROM quickbooks_transactions
      WHERE client_id = $1
      ORDER BY transaction_date DESC`,
      [clientId]
    );

res.json(savedTransactions.rows);

  } catch (error) {
    console.error('QuickBooks AI error:', error);
    res.status(500).json({ error: error.message });
  }
});

//Database DB Endpoints
app.get('/api/transactions/:clientId', async (req, res) => {
  try {
    const result = await client.query(
      `SELECT transactions.*, clients.company_name
       FROM transactions
       JOIN clients ON transactions.client_id = clients.id
       WHERE transactions.client_id = $1`,
      [req.params.clientId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/transactions/:clientId/approve-all', async (req, res) => {
  try {
    await client.query(
      `UPDATE transactions
       SET status = 'approved'
       WHERE client_id = $1`,
      [req.params.clientId]
    );

    res.json({ message: 'All transactions approved' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/transactions/:clientId/approve-high-confidence', async (req, res) => {
  try {
    await client.query(
      `UPDATE transactions
       SET status = 'approved'
       WHERE client_id = $1
       AND confidence >= 0.90`,
      [req.params.clientId]
    );

    res.json({ message: 'High-confidence transactions approved' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/transactions/:clientId/auto-categorize', async (req, res) => {
  try {
      const transactionsResult = await client.query(
        `SELECT id, payee, description, memo, amount
        FROM transactions
        WHERE client_id = $1
          AND (category IS NULL OR confidence IS NULL)`,
        [req.params.clientId]
      );

    const categoriesResult = await client.query(
      'SELECT name FROM categories ORDER BY name'
    );

    const categories = categoriesResult.rows.map(row => row.name);

    await Promise.all(
      transactionsResult.rows.map(async (transaction) => {
        const response = await openai.responses.create({
          model: 'gpt-5-mini',
          input: `
You are categorizing a bookkeeping transaction.

Transaction:
Payee: ${transaction.payee}
Description: ${transaction.description || 'None'}
Memo: ${transaction.memo || 'None'}
Amount: ${transaction.amount}
QuickBooks Account or Item: ${transaction.quickbooksAccountOrItem || 'None'}
Line Items: ${JSON.stringify(transaction.lineItems || [])}

Approved categories:
${categories.join(', ')}

Choose exactly ONE category from the approved categories.

Return:
- category
- confidence

Confidence must be a number between 0 and 1.

Do not invent a category.
          `,
          text: {
            format: {
              type: 'json_schema',
              name: 'transaction_category',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  category: {
                    type: 'string',
                    enum: categories
                  },
                  confidence: {
                    type: 'number',
                    minimum: 0,
                    maximum: 1
                  },
                  reason: {
                    type: 'string'
                  }
                },
                required: ['category', 'confidence', 'reason'],
                additionalProperties: false
              }
            }
          }
        });

        const aiResult = JSON.parse(response.output_text);

        await client.query(
          `UPDATE transactions
          SET category = $1,
              confidence = $2,
              reason = $3
          WHERE id = $4`,
          [
            aiResult.category,
            aiResult.confidence,
            aiResult.reason,
            transaction.id
          ]
        );
      })
    );

    res.json({ message: 'Transactions categorized by AI' });

  } catch (error) {
    console.error('AI categorization error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/clients', async (req, res) => {
  try {
    const result = await client.query('SELECT * FROM clients');
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/categories', async (req, res) => {
  try {
    const result = await client.query(
      'SELECT * FROM categories ORDER BY name'
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database error' });
  }
});


client.connect()
  .then(() => {
    app.listen(3000, () => {
      console.log('Server running at http://localhost:3000');
    });
  })
  .catch((error) => {
    console.error('Database connection failed:', error);
  });


app.put('/api/quickbooks/transactions/:id/review', async (req, res) => {
  try {
    const { id } = req.params;
    const { category } = req.body;

    const result = await client.query(
      `UPDATE quickbooks_transactions
       SET category = $1,
           human_reviewed = TRUE
       WHERE quickbooks_id = $2
       RETURNING *`,
      [category, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'QuickBooks transaction not found.'
      });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error('QuickBooks review error:', error);
    res.status(500).json({ error: error.message });
  }
});