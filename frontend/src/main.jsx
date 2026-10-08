import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './App.css';

function App() {
  const [transactions, setTransactions] = useState([]);
  const [clientName, setClientName] = useState('');
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(1);
  const [isCategorizing, setIsCategorizing] = useState(false);

  const [quickBooksTransactions, setQuickBooksTransactions] = useState([]);
  const [isQuickBooksLoading, setIsQuickBooksLoading] = useState(false);
  const [isImportingQuickBooks, setIsImportingQuickBooks] = useState(false);
  const [quickBooksError, setQuickBooksError] = useState('');
  const [reviewTransaction, setReviewTransaction] = useState(null);
  const [reviewCategory, setReviewCategory] = useState('');

  const loadTransactions = () => {
    fetch(`${import.meta.env.VITE_API_URL}/api/transactions/${selectedClient}`)
      .then(response => response.json())
      .then(data => {
        setTransactions(data);

        if (data.length > 0) {
          setClientName(data[0].company_name);
        }
      });
  };

  const loadQuickBooksTransactions = () => {
    setQuickBooksError('');

    return fetch(
      `${import.meta.env.VITE_API_URL}/api/quickbooks/transactions/${selectedClient}`
    )
      .then(response => {
        if (!response.ok) {
          throw new Error('Could not load saved QuickBooks transactions.');
        }

        return response.json();
      })
      .then(data => {
        setQuickBooksTransactions(data);
      })
      .catch(error => {
        setQuickBooksError(error.message);
      });
  };

  useEffect(() => {
    loadTransactions();
  }, [selectedClient]);

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/api/clients`)
      .then(response => response.json())
      .then(data => setClients(data));
  }, []);

  return (
    <div className="dashboard">

      <h1>Bookkeeping Dashboard</h1>

      <p className="dashboard-description">
        AI-powered transaction categorization and QuickBooks integration.
      </p>

      <h2>{clientName}</h2>

      <div className="client-selector">
        <label htmlFor="client-select">Client:</label>

        <select
          id="client-select"
          value={selectedClient}
          onChange={(event) => {
            setSelectedClient(event.target.value);
            setQuickBooksTransactions([]);
            setReviewTransaction(null);
          }}
        >
          {clients.map(client => (
            <option key={client.id} value={client.id}>
              {client.company_name}
            </option>
          ))}
        </select>
      </div>

      <h3>AI Review & Actions</h3>

      <p className="section-description">
        Review, categorize, and approve transactions.
      </p>

      <p className="confidence-note">
        Underlined confidence scores are below 90% and may need review.
      </p>

      <div className="actions">

      <button
        title="AI categorizes existing transactions using your approved categories."
        disabled={isCategorizing}
          onClick={() => {
            setIsCategorizing(true);

              fetch(
                `${import.meta.env.VITE_API_URL}/api/transactions/${selectedClient}/auto-categorize`,
                {
                  method: 'PUT'
                }
              )
              .then(response => {
                if (!response.ok) {
                  throw new Error('Could not auto-categorize transactions.');
                }

                return response.json();
              })
              .then(() => {
                loadTransactions();
              })
              .catch(error => {
                console.error(error);
              })
              .finally(() => {
                setIsCategorizing(false);
              });
          }}
        >
          {isCategorizing ? 'Auto-categorizing...' : 'Auto-categorize'}
        </button>

        <button
          title="Loads previously saved QuickBooks transactions from the database."
          disabled={isQuickBooksLoading}
          onClick={() => {
            setIsQuickBooksLoading(true);

            loadQuickBooksTransactions()
              .finally(() => {
                setIsQuickBooksLoading(false);
              });
          }}
        >
          {isQuickBooksLoading
            ? 'Loading Transactions...'
            : 'Load Saved Transactions'}
        </button>

        <button
          title="Imports transactions from QuickBooks and uses AI to categorize them."
          disabled={isImportingQuickBooks}
          onClick={() => {
            setIsImportingQuickBooks(true);
            setQuickBooksError('');

            fetch(
              `${import.meta.env.VITE_API_URL}/api/quickbooks/transactions/auto-categorize?clientId=${selectedClient}`,
              {
                method: 'PUT'
              }
            )
            .then(response => {
              return response.json().then(data => {
                if (!response.ok) {
                  throw new Error(
                    data.error || 'Could not import and categorize QuickBooks transactions.'
                  );
                }

                return data;
              });
            })
              .then(data => {
                setQuickBooksTransactions(data);
              })
              .catch(error => {
                setQuickBooksError(error.message);
              })
              .finally(() => {
                setIsImportingQuickBooks(false);
              });
          }}
        >
          {isImportingQuickBooks
            ? 'Importing & Categorizing...'
            : 'Import & Categorize from QuickBooks'}
        </button>

        <button
          title="Approves all transactions with an AI confidence score of 90% or higher."
          onClick={() => {
            fetch(
              `${import.meta.env.VITE_API_URL}/api/transactions/${selectedClient}/approve-high-confidence`,
              {
                method: 'PUT'
              }
            )
              .then(response => response.json())
              .then(() => {
                loadTransactions();
              });
          }}
        >
          Approve all high-confidence
        </button>

        <button
          title="Approves all transactions for the selected client."
          onClick={() => {
            fetch(
              `${import.meta.env.VITE_API_URL}/api/transactions/${selectedClient}/approve-all`,
              {
                method: 'PUT'
              }
            )
              .then(response => response.json())
              .then(() => {
                loadTransactions();
              });
          }}
        >
          Approve all
        </button>

      </div>

      {quickBooksError && (
        <div className="quickbooks-error">
          <strong>QuickBooks Error</strong>
          <p>{quickBooksError}</p>
        </div>
      )}


      <h2>Transactions</h2>
      

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>DATE</th>
              <th>PAYEE / DESCRIPTION</th>
              <th>MEMO</th>
              <th>AMOUNT</th>
              <th>CATEGORY</th>
              <th>CONFIDENCE</th>
              <th>REVIEW</th>
              <th>REASON</th>
              <th>STATUS</th>
            </tr>
          </thead>

          <tbody>
            {transactions.map(transaction => (
              <tr key={transaction.id}>
                <td>
                  {new Date(transaction.transaction_date).toLocaleDateString('en-US')}
                </td>

                <td>
                  {transaction.payee} / {transaction.description}
                </td>

                <td>
                  {transaction.memo || '\u00A0'}
                </td>

                <td>
                  ${Number(transaction.amount).toFixed(2)}
                </td>

                <td>
                  {transaction.category || '\u00A0'}
                </td>

                <td className={transaction.confidence < 0.90 ? 'low-confidence' : ''}>
                  {Math.round(transaction.confidence * 100)}%
                </td>

                <td
                  className={
                    transaction.confidence < 0.90
                      ? 'review-needed'
                      : 'ai-approved'
                  }
                >
                  {transaction.confidence < 0.90 ? (
                    'Needs Review'
                  ) : (
                    'AI Approved'
                  )}
                </td>

                <td>
                  {transaction.reason}
                </td>

                <td>
                  <span className={`status ${transaction.status}`}>
                    {transaction.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {quickBooksTransactions.length > 0 && (
        <>
          <hr />

          <h2>QuickBooks Transactions</h2>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>PAYEE</th>
                  <th>DESCRIPTION</th>
                  <th>AMOUNT</th>
                  <th>PAYMENT TYPE</th>
                  <th>ACCOUNT</th>
                  <th>QB ACCOUNT / ITEM</th>
                  <th>MEMO</th>
                  <th>CATEGORY</th>
                  <th>CONFIDENCE</th>
                  <th>REVIEW</th>
                  <th>HUMAN REVIEWED</th>
                  <th>REASON</th>
                </tr>
              </thead>

              <tbody>
                {quickBooksTransactions.map(transaction => (
                  <React.Fragment key={transaction.quickbooks_id}>

                    <tr>
                      <td>
                        {transaction.transaction_date
                          ? new Date(transaction.transaction_date).toLocaleDateString('en-US')
                          : ''}
                      </td>

                      <td>
                        {transaction.payee}
                      </td>

                      <td>
                        {transaction.description || '\u00A0'}
                      </td>

                      <td>
                        ${Number(transaction.amount).toFixed(2)}
                      </td>

                      <td>
                        {transaction.payment_type || '\u00A0'}
                      </td>

                      <td>
                        {transaction.account || '\u00A0'}
                      </td>

                      <td>
                        {transaction.quickbooks_account_or_item || '\u00A0'}
                      </td>

                      <td>
                        {transaction.memo || '\u00A0'}
                      </td>

                      <td>
                        {transaction.category || '\u00A0'}
                      </td>

                      <td className={transaction.confidence < 0.90 ? 'low-confidence' : ''}>
                        {Math.round(transaction.confidence * 100)}%
                      </td>

                      <td
                        className={
                          transaction.confidence < 0.90
                            ? 'review-needed'
                            : 'ai-approved'
                        }
                      >
                        {transaction.confidence < 0.90 ? (
                          <button
                            onClick={() => {
                              setReviewTransaction({
                                ...transaction,
                                quickbooks_id:
                                  transaction.quickbooks_id ??
                                  transaction.quickbooksId
                              });

                              setReviewCategory(transaction.category);
                            }}
                          >
                            Review
                          </button>
                        ) : (
                          'AI Approved'
                        )}
                      </td>

                      <td>
                        {transaction.human_reviewed ? 'Yes' : 'No'}
                      </td>

                      <td>
                        {transaction.reason || '\u00A0'}
                      </td>
                    </tr>

                    {reviewTransaction?.quickbooks_id ===
                      (transaction.quickbooks_id ?? transaction.quickbooksId) && (
                      <tr>
                        <td colSpan="12">
                          <h3>Review Transaction</h3>

                          <p>Payee: {reviewTransaction.payee}</p>

                          <p>
                            Amount: ${Number(reviewTransaction.amount).toFixed(2)}
                          </p>

                          <label>
                            Category:

                            <select
                              value={reviewCategory}
                              onChange={(event) => {
                                setReviewCategory(event.target.value);
                              }}
                            >
                              <option value="Advertising">Advertising</option>
                              <option value="Bank Fees">Bank Fees</option>
                              <option value="Meals">Meals</option>
                              <option value="Office Supplies">Office Supplies</option>
                              <option value="Payroll">Payroll</option>
                              <option value="Professional Services">
                                Professional Services
                              </option>
                              <option value="Rent">Rent</option>
                              <option value="Software">Software</option>
                              <option value="Travel">Travel</option>
                              <option value="Utilities">Utilities</option>
                            </select>

                            <button
                              onClick={() => {
                                fetch(
                                  `${import.meta.env.VITE_API_URL}/api/quickbooks/transactions/${reviewTransaction.quickbooks_id}/review`,
                                  {
                                    method: 'PUT',
                                    headers: {
                                      'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                      category: reviewCategory
                                    })
                                  }
                                )
                                  .then(response => {
                                    if (!response.ok) {
                                      throw new Error('Could not save the review.');
                                    }

                                    return response.json();
                                  })
                                  .then(() => {
                                    setReviewTransaction(null);
                                    loadQuickBooksTransactions();
                                  })
                                  .catch(error => {
                                    console.error(error);
                                  });
                              }}
                            >
                              Approve
                            </button>
                          </label>

                          <p>
                            Confidence: {Math.round(reviewTransaction.confidence * 100)}%
                          </p>

                          <p>
                            Reason: {reviewTransaction.reason}
                          </p>

                          <button
                            onClick={() => {
                              setReviewTransaction(null);
                            }}
                          >
                            Close Review
                          </button>
                        </td>
                      </tr>
                    )}

                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);