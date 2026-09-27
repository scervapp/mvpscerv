# Polling inventory

Purpose: document every polling callable used by restaurant/customer/browser screens so latency and cost are explicit.

Status: not started.

| Surface | Screen/context/hook | Callable(s) | Interval | Starts when | Stops when | Estimated invocations/device/hour | Latency impact | Owner | Notes |
| --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- |
| Restaurant | `RestaurantDataContext` | TBD | TBD | Staff session active | App background/unmount |  | Badges/sounds | ENG | Fill from source audit |
| Restaurant | `useRestaurantOperationsBadges` | TBD | TBD | Staff session active | App background/unmount |  | Dashboard/nav badges | ENG | Fill from source audit |
| Restaurant | `ChefsQScreen` | TBD | TBD | Queue screen active | Screen blur/unmount |  | KDS visibility | ENG/OPS | Fill from source audit |
| Restaurant | `TableManagementScreen` | TBD | TBD | Screen active | Screen blur/unmount |  | Table state | ENG/OPS | Fill from source audit |
| Restaurant | `RestaurantReservationsScreen` | TBD | TBD | Screen active | Screen blur/unmount |  | Reservation ops | ENG/OPS | Fill from source audit |

## Required decisions

- Pilot KDS p95/p99 visible-order latency target.
- Which screens need realtime projection collections instead of polling.
- Maximum acceptable steady-state function invocation rate per restaurant.
- Whether polling intervals differ by role, screen focus or device type.
