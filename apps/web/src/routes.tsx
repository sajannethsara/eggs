import { createBrowserRouter, Navigate } from "react-router"
import { RequireRole } from "@/lib/auth"
import { HomePage } from "@/pages/home"
import { SignInPage } from "@/pages/sign-in"
import { OwnerLayout } from "@/apps/owner/layout"
import { OwnerToday } from "@/apps/owner/today"
import { OwnerApprove } from "@/apps/owner/approve"
import { OwnerWork } from "@/apps/owner/work"
import { OwnerContacts } from "@/apps/owner/contacts"
import { OwnerReports } from "@/apps/owner/reports"
import { OfficeLayout } from "@/apps/office/layout"
import { OfficeInbox } from "@/apps/office/inbox"
import { OfficeOrders } from "@/apps/office/orders"
import { OfficeDeliveries } from "@/apps/office/deliveries"
import { OfficeStock } from "@/apps/office/stock"
import { OfficeDirectory } from "@/apps/office/directory"
import { OfficeMoney } from "@/apps/office/money"
import { OfficeStaff } from "@/apps/office/staff"
import { OfficeTasks } from "@/apps/office/tasks"
import { PosApp } from "@/apps/pos/pos"
import { DriverLayout } from "@/apps/driver/layout"
import { DriverStops } from "@/apps/driver/stops"
import { DriverStop } from "@/apps/driver/stop"
import { DriverLoad } from "@/apps/driver/load"
import { DriverEndOfDay } from "@/apps/driver/end-of-day"
import { WarehouseLayout } from "@/apps/warehouse/layout"
import { WarehouseHome } from "@/apps/warehouse/home"
import { WarehouseReceive } from "@/apps/warehouse/receive"
import { WarehouseSend } from "@/apps/warehouse/send"
import { WarehouseCount } from "@/apps/warehouse/count"
import { WarehouseSpoiled } from "@/apps/warehouse/spoiled"
import { NotFound } from "@/pages/not-found"

export const router = createBrowserRouter([
  { path: "/", element: <HomePage /> },
  { path: "/sign-in/:role", element: <SignInPage /> },
  {
    path: "/owner",
    element: (
      <RequireRole role="OWNER">
        <OwnerLayout />
      </RequireRole>
    ),
    children: [
      { index: true, element: <OwnerToday /> },
      { path: "approve", element: <OwnerApprove /> },
      { path: "work", element: <OwnerWork /> },
      { path: "contacts", element: <OwnerContacts /> },
      { path: "contacts/:id", element: <OwnerContacts /> },
      { path: "reports", element: <OwnerReports /> },
    ],
  },
  {
    path: "/office",
    element: (
      <RequireRole role="OFFICE">
        <OfficeLayout />
      </RequireRole>
    ),
    children: [
      { index: true, element: <Navigate to="inbox" replace /> },
      { path: "inbox", element: <OfficeInbox /> },
      { path: "orders", element: <OfficeOrders /> },
      { path: "deliveries", element: <OfficeDeliveries /> },
      { path: "stock", element: <OfficeStock /> },
      { path: "directory", element: <OfficeDirectory /> },
      { path: "directory/:id", element: <OfficeDirectory /> },
      { path: "money", element: <OfficeMoney /> },
      { path: "staff", element: <OfficeStaff /> },
      { path: "tasks", element: <OfficeTasks /> },
    ],
  },
  {
    path: "/pos",
    element: (
      <RequireRole role="CASHIER">
        <PosApp />
      </RequireRole>
    ),
  },
  {
    path: "/driver",
    element: (
      <RequireRole role="DRIVER">
        <DriverLayout />
      </RequireRole>
    ),
    children: [
      { index: true, element: <DriverStops /> },
      { path: "stop/:id", element: <DriverStop /> },
      { path: "load", element: <DriverLoad /> },
      { path: "end", element: <DriverEndOfDay /> },
    ],
  },
  {
    path: "/warehouse",
    element: (
      <RequireRole role="WAREHOUSE">
        <WarehouseLayout />
      </RequireRole>
    ),
    children: [
      { index: true, element: <WarehouseHome /> },
      { path: "receive", element: <WarehouseReceive /> },
      { path: "receive/:id", element: <WarehouseReceive /> },
      { path: "send", element: <WarehouseSend /> },
      { path: "count", element: <WarehouseCount /> },
      { path: "spoiled", element: <WarehouseSpoiled /> },
    ],
  },
  { path: "*", element: <NotFound /> },
])
