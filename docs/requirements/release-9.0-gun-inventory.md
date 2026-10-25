# Release 9.0 — Gun Inventory, Usage & Maintenance Tracking (`R90`)

> **Status**: ✅ Implemented  
> **Release Number**: Release 9.0 (`R90`, major version increment after Release 8.0 Tablet Scoring)  
> **Branch**: `R90-feature-gun-inventory`  
> **Storage**: Cost-effective JSON file persistence (`scoring-proxy/data/gun-inventory.json`) + YAML group configuration (`config/gun-inventory-config.yml`)

---

## 1. Overview

TurRes maintains club loaner firearms (*laina-aseet*) used by shooters in the **"Laina-ase"** squad (Squad 1 at Kupittaa Cup) and training events. Release 9.0 adds a dedicated **Gun Inventory, Usage & Maintenance Tracking** capability integrated into both a standalone Inventory page (`#/guns`) and the Cup Management page (`#/manage`).

Key capabilities:
1. **Gun Inventory CRUD**: Track each firearm's **Make (`make`)**, **Model (`model`)**, **Serial Number (`serialNumber`)**, and **Acquisition Year (`acquisitionYear`)**, plus current state (`in_gun_safe` / *Asekaapissa*, `in_range_use` / *Radalla käytössä*, or `retired` / *Poistettu käytöstä*).
2. **Laina-ase Checkout & Cartridge Bookkeeping from `#/manage`**:
   - In the Cup Management UI (`#/manage`), for shooters in the `"Laina-ase"` squad, admins can pick a shooter, select an available gun from the inventory, and record the **number of cartridges given (`patruunamäärä` / `cartridgesGiven`)** — defaulting to **`100` rounds** (typical Kupittaa allocation) or **`0` rounds** (when the shooter has a permit to buy cartridges but does not own a gun yet), or any custom integer.
   - Checking out a gun marks its state as **`in_range_use`** (*Radalla käytössä*), links it to the shooter and cup, increments **`timesUsedTotal`** (`+1`) and **`timesUsedSinceMaintenance`** (`+1`), and adds `cartridgesGiven` to **`cartridgesIssuedTotal`** and **`cartridgesSinceMaintenance`**.
3. **End-of-Match Return to Gun Safe**:
   - At the end of a match/cup, admins can return checked-out guns back to **`in_gun_safe`** (*Asekaapissa*) either individually or via a one-click **"Palauta kaikki laina-aseet kaappiin"** (*Return all range guns to safe*) action in `#/manage` and `#/guns`.
4. **Cleaning & Maintenance Recording**:
   - Admins can record a **cleaning/maintenance** event (`recordMaintenance`, with optional notes and timestamp) for any gun in the inventory, which resets `timesUsedSinceMaintenance` and `cartridgesSinceMaintenance` to `0` while preserving `timesUsedTotal`, `cartridgesIssuedTotal`, and the maintenance log history.
5. **Restricted Access via Configurable SSI Group (`25874`)**:
   - Access to gun inventory endpoints and UI is restricted to authenticated SSI users who have role **`"admin"`** in the configured SSI group (default group ID **`25874`** — `https://shootnscoreit.com/groups/25874/`, configurable via `config/gun-inventory-config.yml` and `SSI_GUN_INVENTORY_GROUP_ID` environment variable).

---

## 2. Requirements Matrix (`R90-GUN1`–`R90-GUN8`)

| ID | Requirement | Priority | Status |
|---|---|:---:|---|
| **R90-GUN1** | **Configurable SSI Group Admin Access Control**: Restrict all gun inventory and loaner-gun management endpoints to authenticated users who hold the `"admin"` role in the configured SSI group (default Group ID `25874`, `https://shootnscoreit.com/groups/25874/`). Group ID and allowed roles must be configurable in `config/gun-inventory-config.yml` (with `SSI_GUN_INVENTORY_GROUP_ID` env override). Scrape/verify membership on SSI `/groups/{groupId}/` (or staff/group page) and cache per session. | HIGH | ✅ Implemented |
| **R90-GUN2** | **JSON File Gun Inventory Store & CRUD API**: Persist gun inventory, active checkouts, usage counters, and maintenance history in `scoring-proxy/data/gun-inventory.json`. Support full CRUD (`GET /api/v1/guns`, `POST /api/v1/guns`, `PUT /api/v1/guns/:id`, `DELETE /api/v1/guns/:id` retire/archive) with fields: `id`, `make`, `model`, `serialNumber`, `acquisitionYear`, `state` (`in_gun_safe` \| `in_range_use` \| `retired`), `timesUsedTotal`, `timesUsedSinceMaintenance`, `cartridgesIssuedTotal`, `cartridgesSinceMaintenance`, `currentCheckout`, `maintenanceHistory`, `usageHistory`. | HIGH | ✅ Implemented |
| **R90-GUN3** | **Laina-ase Checkout & Cartridge Tracking (`patruunamäärä`)**: Provide `POST /api/v1/guns/:id/checkout` accepting `{ shooterName, shooterEmail, cupId, cupName, cartridgesGiven }`. Validate that the gun is currently `in_gun_safe` and `cartridgesGiven` is a non-negative integer (default `100`, or `0` for shooters with ammunition permit). Transition gun state to `in_range_use`, increment `timesUsedTotal` and `timesUsedSinceMaintenance` by `1`, add `cartridgesGiven` to `cartridgesIssuedTotal` and `cartridgesSinceMaintenance`, and record the checkout entry. | HIGH | ✅ Implemented |
| **R90-GUN4** | **Return Guns to Safe (Single & Bulk End-of-Match Return)**: Provide `POST /api/v1/guns/:id/return` and `POST /api/v1/guns/return-all` (optionally scoped by `cupId`) to transition checked-out firearms from `in_range_use` back to `in_gun_safe` and clear `currentCheckout` while preserving cumulative usage counters and history. | HIGH | ✅ Implemented |
| **R90-GUN5** | **Cleaning & Maintenance Recording**: Provide `POST /api/v1/guns/:id/maintenance` accepting `{ notes }` (and recording `performedBy` from session identity + timestamp). Append to `maintenanceHistory` and reset `timesUsedSinceMaintenance = 0` and `cartridgesSinceMaintenance = 0` while preserving `timesUsedTotal` and `cartridgesIssuedTotal`. | HIGH | ✅ Implemented |
| **R90-GUN6** | **Gun Inventory & Maintenance Web UI (`#/guns`)**: Add `#/guns` page (linked from `HomePage.jsx` and `ManagePage.jsx`) displaying all guns with state badge (`Asekaapissa` / `Radalla käytössä`), Make, Model, Serial Number, Acquisition Year, total times used & cartridges issued, times used & cartridges since last cleaning/maintenance, Add/Edit gun modal, Record Cleaning/Maintenance action, and Return to Safe action. | HIGH | ✅ Implemented |
| **R90-GUN7** | **ManagePage (`#/manage`) Laina-ase Squad Integration**: In `SquaddingOverview` / `SquadCard` on `#/manage`, for shooters in the `"Laina-ase"` squad, allow admins to pick a shooter -> open a Laina-ase Picker sheet -> select an available gun from `in_gun_safe` and choose cartridge count (`100 patr.`, `0 patr.`, or custom number) -> mark gun as `in_range_use`. Display the assigned gun & cartridge badge next to the shooter, plus individual "Palauta kaappiin" and cup-level "Palauta kaikki laina-aseet kaappiin" buttons. | HIGH | ✅ Implemented |
| **R90-GUN8** | **Unit, Integration & Playwright E2E Verification**: Add unit tests for `gun-inventory-service.js` and SSI group admin check, API route tests for `/api/v1/guns/*`, component tests for `GunsPage` and `LoanerGunPickerSheet`, and Playwright E2E coverage. | MEDIUM | ✅ Implemented |
| **R90-GUN9** | **Gun Inventory & Usage Privacy Notice (*Rekisteriseloste*, FI & EN)**: Publish a simple, legally valid bilingual privacy notice (`docs/privacy-notice-gun-inventory.md` and `#/privacy-guns` in `LegalDocumentPage.jsx`) covering GDPR Art. 13–14 & Finnish Firearms Act duty of care, personal data recorded on checkout/maintenance, Group `25874` admin access restriction, EU hosting, retention, and data subject rights. | HIGH | ✅ Implemented |
| **R90-GUN10** | **Persistent Disk Storage for Gun Inventory & Event Store**: Configure a cost-optimized 1 GB Render Persistent Disk (`turres-ssi-data`, `mountPath: /opt/render/project/src/scoring-proxy/data` in `render.yaml`) so `gun-inventory.json` (inventory + loan/maintenance events) and `staffing-events.json` persist across redeploys and restarts in Frankfurt without managed database costs. | HIGH | ✅ Implemented |
| **R90-GUN11** | **Link Gun Inventory to Ammo Inventory (`defaultAmmoId` / *Käytettävä patruuna*)**: Allow linking each firearm in the gun inventory (`createGun`/`updateGun`, `GunsPage.jsx`) to a specific Ammo Inventory item via `defaultAmmoId` (resolved to `make + model + caliber`, e.g., `"GCI FMJ 124gr 9x19"` for Glock). When a range officer selects a gun for a shooter in `LoanerGunPickerSheet.jsx` (`#/manage`), automatically pre-select and display the gun's linked ammo item and deduct issued cartridges (`cartridgesGiven`) from that linked ammo item on checkout. | HIGH | ✅ Implemented |
| **R90-GUN12** | **Cartridge / Ammo Purchase & Stock Inventory (`make + model + caliber`, Group `25874` Admin Restricted)**: Maintain an ammunition inventory grouped by `(make, model, caliber)` in `gun-inventory.json`, restricted to the same SSI Group (`25874`, role `"admin"`) as gun inventory. Support adding newly purchased ammo batches (`POST /api/v1/guns/ammo/purchases`) with `make`, `model`, `caliber`, `count`, `price`, `store`, `purchaseDate`, and `purchasedBy`, increasing `calculatedStock` and `totalPurchased`. | HIGH | ✅ Implemented |
| **R90-GUN13** | **Automatic Ammo Stock Deduction on Laina-ase Checkout**: When a shooter borrows a gun (`POST /api/v1/guns/:id/checkout`) with `cartridgesGiven > 0`, automatically deduct `cartridgesGiven` from the matching `(make, model, caliber)` ammo stock (`calculatedStock -= cartridgesGiven`, `totalIssued += cartridgesGiven`). | HIGH | ✅ Implemented |
| **R90-GUN14** | **Physical Ammo Stocktake & Discrepancy Calculation (*Patruunainventointi*)**: Provide `POST /api/v1/guns/ammo/:ammoId/stocktake` accepting `{ actualCount, notes }` to compare `calculatedStock` against physical count (`discrepancy = actualCount - calculatedStock`), log the stocktake entry (`calculatedBefore`, `actualCount`, `discrepancy`, `performedBy`, `timestamp`), and update `calculatedStock = actualCount`. | HIGH | ✅ Implemented |
| **R90-GUN15** | **CSV Export for Gun Inventory & Gun Events**: Provide authorized endpoints (`GET /api/v1/guns/export/guns.csv` and `GET /api/v1/guns/export/gun-events.csv`, Group `25874` `admin` restricted) and download buttons on `#/guns` exporting gun inventory and all gun loan/maintenance events in standard CSV format. | HIGH | ✅ Implemented |
| **R90-GUN16** | **CSV Export for Ammo Inventory & Ammo Events**: Provide authorized endpoints (`GET /api/v1/guns/export/ammo.csv` and `GET /api/v1/guns/export/ammo-events.csv`, Group `25874` `admin` restricted) and download buttons on `#/guns` exporting ammo stock by `(make, model, caliber)` and all ammo purchase/stocktake events in standard CSV format. | HIGH | ✅ Implemented |

---

## 3. Data Model (`scoring-proxy/data/gun-inventory.json`)

```json
{
  "guns": [
    {
      "id": "gun-1",
      "make": "CZ",
      "model": "Shadow 2",
      "serialNumber": "D482910",
      "acquisitionYear": 2023,
      "state": "in_gun_safe",
      "timesUsedTotal": 14,
      "timesUsedSinceMaintenance": 3,
      "cartridgesIssuedTotal": 1200,
      "cartridgesSinceMaintenance": 300,
      "lastMaintenanceAt": "2026-09-15T17:30:00.000Z",
      "lastMaintenanceBy": "admin@example.com",
      "currentCheckout": null,
      "maintenanceHistory": [
        {
          "id": "maint-1",
          "timestamp": "2026-09-15T17:30:00.000Z",
          "performedBy": "admin@example.com",
          "notes": "Puhdistus ja voitelu",
          "timesUsedBeforeReset": 11,
          "cartridgesBeforeReset": 900
        }
      ],
      "usageHistory": [
        {
          "id": "use-14",
          "checkedOutAt": "2026-10-18T09:15:00.000Z",
          "returnedAt": "2026-10-18T14:20:00.000Z",
          "shooterName": "Matti Meikäläinen",
          "shooterEmail": "matti@example.com",
          "cupId": "160",
          "cupName": "TurRes Kupittaa CUP",
          "cartridgesGiven": 100,
          "checkedOutBy": "admin@example.com"
        }
      ]
    }
  ]
}
```
