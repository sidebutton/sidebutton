# AWS Connection Setup

This guide explains how to connect your AWS account to SideButton so you can provision and manage agent VMs directly from the portal.

## Overview

SideButton provisions EC2 instances on your behalf using a dedicated IAM user with a least-privilege policy. Once connected, you can deploy agents with one click and SideButton handles the full VM lifecycle (launch, reboot, stop, start, terminate).

---

## Prerequisites

- An AWS account with permission to create IAM users and policies
- AWS Console access (or CLI)

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
        "ec2:CreateSecurityGroup",
        "ec2:AuthorizeSecurityGroupIngress",
        "ec2:DeleteSecurityGroup",
        "ec2:DescribeSecurityGroups",
        "ec2:CreateKeyPair",
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

1. Open the SideButton portal → **Settings** → **Infrastructure**
2. Click **Connect AWS** and fill in the form:
   - **Connection Name** (e.g., "Production AWS")
   - **Access Key ID** and **Secret Access Key** from Step 3
   - Optionally set a **Default Region** (e.g., `us-east-1`)
3. Click **Connect & Validate** — SideButton verifies credentials and checks permissions

### Permission Checker

The **Connect & Validate** button uses `iam:SimulatePrincipalPolicy` to dry-run every required action against your credentials without making any real AWS API calls. If any permissions are missing, they are displayed in a checklist so you can patch your IAM policy quickly.

If your IAM user does not have `iam:SimulatePrincipalPolicy` itself, a warning is shown and you will need to verify permissions manually.

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `InvalidClientTokenId` | Access Key ID is wrong or deleted | Re-create the access key in Step 3 |
| `SignatureDoesNotMatch` | Secret Access Key is wrong | Copy it again from the AWS console |
| `AuthFailure` | Credentials are inactive or expired | Check IAM user status in IAM → Users |
| Permission denied on `ec2:RunInstances` | IAM policy is missing the action | Attach the full policy from Step 1 |
| `Cannot simulate permissions` | IAM user lacks `iam:SimulatePrincipalPolicy` | Add the action to the policy or verify manually |

---

## Security Notes

- SideButton stores credentials encrypted with AES-256-GCM
- Credentials are never logged or exposed in API responses
- You can delete the connection at any time — SideButton will refuse deletion if agents are still attached
- Use a dedicated IAM user per environment (production, staging) to isolate blast radius
- Rotate access keys quarterly via IAM → Users → Security credentials → **Rotate**
