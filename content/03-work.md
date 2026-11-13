# Work Experience

I have been an AI and Data Scientist at FCI CCM in Mumbai since April 2025. FCI CCM works in customer communication management: it helps banks, insurers and other enterprises talk to their customers over SMS, email, WhatsApp and push notifications. Its core platform is called VARTA. I work between data, technology and the business: SQL, Python, PySpark, dashboards and AI features, for banking and insurance clients.

## Customer Engagement and Next-Best-Action
The business problem: banks and insurers message thousands or millions of customers, and sending the same message to everyone isn’t effective. Some customers respond better to WhatsApp, some to SMS, some need an extra reminder. The idea was to help businesses decide which customers to contact, on which channel, and what the most relevant next action is, so communication becomes smarter than bulk sending. My part was the data and analytics side: SQL, Python and Superset dashboards, finding patterns in how customers respond across channels. I joined four channels into one customer view, built segments and engagement models, and set up an A/B testing framework to compare personalised channel picks with the earlier blanket approach.

## VARTASense (Real-Time Decisioning Platform)
Streaming bank events into a feature store, with churn, pre-delinquency and uplift models, explainable decisions and safe rollouts. I built this together with my data science team.

## ProductLens (Feedback-Insights Tool)
Turns about 25,000 tickets from Zoho Desk, Outlook and Jira into prioritised product insights, cutting review time by 60% at an F1-score of 0.89. I built this together with my data science team.

## Document Checking with RAG
Validates about 12,000 documents a month at 92% agreement with manual review, deployed as services behind an API. I built this together with my data science team.

## Pipelines and Dashboards
I made cross-channel data pipelines about 45% faster across 4.5 million records using PySpark and SQL on Databricks, and I published client-facing dashboards for banking and insurance clients, including a Renewal Unpaid Dues dashboard for SBI Life, which gave business teams one clear view of renewal metrics.

## Toughest Moment
I was working with millions of production records and complex joins across many tables. Queries were slow, some timed out, and a dashboard took three to four minutes to load. My first instinct was to fetch everything and build on top, but that doesn’t scale. So I changed the approach: filter early, cut unnecessary joins, aggregate at the right level, and shape datasets around the real business question. I also learned that stakeholders often don’t need millions of rows, they need a summary that helps them decide. Now I think about performance, scalability, data quality and the business need together, and I try to understand the question before I write the SQL.
