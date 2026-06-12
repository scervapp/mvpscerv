# Scerv Rewards and Restaurant Clubs

Scerv Rewards has two layers:

1. Scerv points are platform-wide and always earn on eligible paid orders.
2. Restaurant Clubs are optional programs controlled by each restaurant.

## Scerv Points

Paid orders earn Scerv points from the order subtotal. These are stored on the
customer document under `rewardsSummary` and in the customer's
`scervRewardsLedger` subcollection.

## Restaurant Clubs

Restaurants can opt into a restaurant-specific club by adding a
`loyaltyProgram` object to their restaurant document:

```js
{
  enabled: true,
  name: "Regulars Club",
  programType: "hybrid",
  pointsPerDollar: 1,
  tiers: [
    {
      id: "regular",
      name: "Regular",
      thresholdType: "visits",
      thresholdValue: 5,
      rewardType: "free_item",
      rewardLabel: "Free appetizer"
    },
    {
      id: "vip",
      name: "VIP",
      thresholdType: "spend",
      thresholdValue: 50000,
      rewardType: "custom",
      rewardLabel: "VIP hospitality perk"
    }
  ]
}
```

`thresholdType` can be `visits`, `spend`, or `points`. Spend thresholds are in
cents.

Customer progress is stored under:

```txt
customers/{customerId}/restaurantClubs/{restaurantId}
```

The backend updates visits, lifetime spend, club points, current tier, and
unlocked rewards after paid orders.
