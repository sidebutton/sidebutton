# AWS Connection Setup

This guide explains how to connect your AWS account to SideButton so you can provision and manage agent VMs directly from the portal.

## Overview

SideButton provisions EC2 instances on your behalf using a dedicated IAM user with a least-privilege policy. Once connected, you can deploy agents with one click and SideButton handles the full VM lifecycle (launch, reboot, stop, start, terminate).

---

## Prerequisites

- An AWS account with permission to create IAM users and policies
- AWS Console access (or CLI)

> **Best practice:** don't run agents next to your production workloads. Create a [dedicated AWS account for agents](#recommended-a-dedicated-aws-account-for-agents) first, then perform Steps 1–4 inside it.

---

## Recommended: a Dedicated AWS Account for Agents

The IAM policy below uses `Resource: "*"` — in a shared account the SideButton user could describe or terminate **any** EC2 instance, not just agent VMs. Running agents in their own AWS account removes that risk entirely and keeps your existing setup untouched.

| Benefit | Why it matters |
|---------|----------------|
| Blast-radius isolation | `Resource: "*"` then only reaches agent resources — your production instances live in a different account the credentials can't see |
| No interference | SideButton creates security groups, key pairs, and tags; in a clean account these never collide with existing infrastructure or drift-detection tooling |
| Cost separation | The account's bill **is** the agent spend — filter by linked account in Cost Explorer, set an AWS Budget alert on just this account |
| Quota isolation | vCPU quotas are per account and region — agents can't eat production launch capacity, and vice versa |
| Clean teardown | Done experimenting? Close the account and everything is gone |

### Create the member account (AWS Organizations)

1. In your **management account**, open [AWS Organizations](https://console.aws.amazon.com/organizations/) → **AWS accounts** → **Add an AWS account** → **Create an AWS account**
2. Name it (e.g., `sidebutton-agents`) and give it a unique email — plus-addressing works well (e.g., `aws+sidebutton-agents@example.com`)
3. Leave the IAM role name as the default `OrganizationAccountAccessRole`

Or via CLI:

```bash
aws organizations create-account \
  --email aws+sidebutton-agents@example.com \
  --account-name "SideButton Agents"

# poll until State shows SUCCEEDED, then note the new account ID
aws organizations list-create-account-status --states SUCCEEDED
```

### Access the new account

Use **Switch role** in the console (account ID + role `OrganizationAccountAccessRole`), or add a CLI profile:

```ini
# ~/.aws/config
[profile sidebutton-agents]
role_arn = arn:aws:iam::<member-account-id>:role/OrganizationAccountAccessRole
source_profile = management
```

Then perform [Step 1](#step-1-create-an-iam-policy) through [Step 4](#step-4-connect-in-sidebutton) **inside this account**. Don't reuse an IAM user or access keys from another account.

### First-run checklist for a fresh account

New accounts start with defaults that block or degrade the first provision — SideButton's provisioning preflight checks all of these, but fixing them up front avoids a failed first launch:

| Check | Why | Fix |
|-------|-----|-----|
| vCPU quotas | Fresh accounts often start at or near **0** — quota `0` is a provisioning blocker | In the target region: **Service Quotas → Amazon EC2** → request *Running On-Demand Standard instances* (`L-1216C47A`) and, if you plan spot agents, *All Standard Spot Instance Requests* (`L-34B43A08`). Agent VMs use 2–4 vCPUs each, so 32 vCPUs ≈ 8–16 agents |
| Default VPC | The provisioner launches into the region's default VPC/subnets; provisioning fails with `No default VPC found in region` if it's missing | New accounts include one per region. If landing-zone tooling removed it: `aws ec2 create-default-vpc --region <region>` |
| Region opt-in | Newer regions are disabled by default; the preflight flags this as a blocker | Enable the region under **Billing → Account → AWS Regions** |
| Root user hygiene | The account is created with only a root user reachable by email password-reset | Enable MFA on root, then stop using it — do Steps 1–3 via `OrganizationAccountAccessRole` |

### Optional: guardrail the account with an SCP

To guarantee agents only ever launch in approved regions, attach a Service Control Policy to the member account from the management account:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "LimitAgentLaunchRegions",
      "Effect": "Deny",
      "Action": "ec2:RunInstances",
      "Resource": "*",
      "Condition": {
        "StringNotEquals": { "aws:RequestedRegion": ["eu-central-1", "us-east-1"] }
      }
    }
  ]
}
```

### Without AWS Organizations

On a standalone account (no organization), you can still sign up for a brand-new separate AWS account and use it exclusively for agents — and optionally create an organization from your existing account later and invite it. If a second account is not an option, the dedicated IAM user in this guide is the minimum isolation: it separates credentials, but not blast radius, quotas, or billing.

---

## Step 1: Create an IAM Policy

1. Go to the [IAM Console](https://console.aws.amazon.com/iam/) → **Policies** → **Create policy**
2. Switch to the **JSON** tab and paste the following policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SideButtonAgentManagement",
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeRegions",
        "ec2:DescribeInstances",
        "ec2:DescribeInstanceTypes",
        "ec2:RunInstances",
        "ec2:TerminateInstances",
        "ec2:RebootInstances",
        "ec2:StartInstances",
        "ec2:StopInstances",
        "ec2:DescribeSpotInstanceRequests",
        "ec2:CancelSpotInstanceRequests",
        "ec2:CreateSecurityGroup",
        "ec2:AuthorizeSecurityGroupIngress",
        "ec2:RevokeSecurityGroupIngress",
        "ec2:DeleteSecurityGroup",
        "ec2:DescribeSecurityGroups",
        "ec2:CreateKeyPair",
        "ec2:ImportKeyPair",
        "ec2:DeleteKeyPair",
        "ec2:DescribeKeyPairs",
        "ec2:CreateTags",
        "ec2:DescribeImages",
        "ec2:DescribeVpcs",
        "ec2:DescribeSubnets",
        "sts:GetCallerIdentity"
      ],
      "Resource": "*"
    }
  ]
}
```

3. Click **Next**, name the policy `SideButtonAgentManagement`, and click **Create policy**

> **Note:** All actions use `Resource: *`. You can optionally scope `ec2:RunInstances` to a specific region by adding a condition, but this is not required for the basic setup.

---

## Step 2: Create an IAM User

1. Go to **IAM** → **Users** → **Create user**
2. Enter a username (e.g., `sidebutton-agent-manager`)
3. On the **Permissions** step, choose **Attach policies directly**
4. Search for `SideButtonAgentManagement` and select it
5. Complete user creation

---

## Step 3: Create an Access Key

1. Open the user you just created → **Security credentials** tab
2. Click **Create access key**
3. Choose **Application running outside AWS** as the use case
4. Click **Create access key**
5. **Copy both the Access Key ID and Secret Access Key** — you will not be able to see the secret again

> ⚠️ Never commit access keys to version control. Store them only in the SideButton portal.

---

## Step 4: Connect in SideButton

1. Open the SideButton portal → **Integrations** → **Cloud**
2. On the **AWS** card click **Connect** and fill in the form:
   - **Display name** (e.g., "Production AWS")
   - **Access Key ID** and **Secret Access Key** from Step 3
   - Optionally pick a **Default Region** (e.g., `us-east-1`)
3. Click **Connect & Validate** — SideButton verifies the credentials against the AWS API and stores them encrypted

Connecting also performs one-time infrastructure setup: SideButton ensures the shared per-account security group (`sidebutton-acct-<account>`) exists and adds the IP you connected from to its SSH/RDP allowlist. This step is best-effort — a failure is returned as a warning and the setup is retried at the first provision. The allowlist is editable later under **Settings → Cloud Operations → Firewall allowlist**.

### Required permissions

The IAM policy in [Step 1](#step-1-create-an-iam-policy) **is** the required permission set — attach it in full and `Connect & Validate` will succeed.

> The connect form no longer runs an in-page permission simulator. (Earlier versions had a separate "Check Permissions" button.) If a required action is missing, the failing AWS call surfaces the specific permission at connect or provisioning time — add it to the policy above and retry. The [Troubleshooting](#troubleshooting) table below maps common errors to the action to add.
>
> Exception: the **Validate** button on an already-connected AWS card *does* dry-run the full required action set via `iam:SimulatePrincipalPolicy` when that action is granted. A connection missing any required action is then marked **invalid** with the gaps listed — so if you grant the simulator action, attach the Step 1 policy in full.

### Optional actions

Everything works without these; granting them enables extra checks:

| Action | What it enables |
|--------|-----------------|
| `iam:SimulatePrincipalPolicy` | **Validate** dry-runs the required action set and reports missing permissions by name instead of relying on runtime errors |
| `servicequotas:GetServiceQuota` | The provisioning preflight verifies your vCPU quota (on-demand and spot); without it the quota check degrades to a non-blocking warning |

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `InvalidClientTokenId` | Access Key ID is wrong or deleted | Re-create the access key in Step 3 |
| `SignatureDoesNotMatch` | Secret Access Key is wrong | Copy it again from the AWS console |
| `AuthFailure` | Credentials are inactive or expired | Check IAM user status in IAM → Users |
| Permission denied on `ec2:RunInstances` | IAM policy is missing the action | Attach the full policy from Step 1 |
| Firewall allowlist update fails with `UnauthorizedOperation` | Connection was created before `ec2:RevokeSecurityGroupIngress` joined the required set | Add the action to the policy (it is in the Step 1 policy above) |
| Spot agent deletion fails with `UnauthorizedOperation` | Policy predates `ec2:DescribeSpotInstanceRequests` / `ec2:CancelSpotInstanceRequests` joining the required set | Both actions are in the Step 1 policy above — re-attach it in full |
| `Cannot simulate permissions` | IAM user lacks `iam:SimulatePrincipalPolicy` | Add the action to the policy or verify manually |

---

## Security Notes

- SideButton stores credentials encrypted with AES-256-GCM
- Credentials are never logged or exposed in API responses
- You can delete the connection at any time — SideButton will refuse deletion if agents are still attached
- Use a dedicated IAM user per environment (production, staging) to isolate blast radius — and prefer a [dedicated AWS account](#recommended-a-dedicated-aws-account-for-agents) over a shared one
- Rotate access keys quarterly via IAM → Users → Security credentials → **Rotate**
