//frontend/src/app/(app)/projects/[id]/purchasing/page.tsx
'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { Boxes, PackageSearch, ShoppingCart, Truck } from 'lucide-react';
import { useProject } from '@/hooks/use-projects';
import { useSitePermissions } from '@/hooks/use-site';
import { Segmented } from '@/components/site/segmented';
import { StockSection } from '@/components/site/purchasing/stock-section';
import { OrderSection } from '@/components/site/purchasing/order-section';
import { DeliverySection } from '@/components/site/purchasing/delivery-section';
import { ConsumptionSection } from '@/components/site/purchasing/consumption-section';
import type { PurchaseOrder } from '@/types/site';

type View = 'stock' | 'orders' | 'deliveries' | 'consumption';

export default function ProjectPurchasingPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const { data: project } = useProject(projectId);
  const permissions = useSitePermissions(projectId);
  const [view, setView] = React.useState<View>('stock');
  const [receiveOrder, setReceiveOrder] = React.useState<PurchaseOrder | null>(null);
  const [newDelivery, setNewDelivery] = React.useState(false);

  const receive = (order: PurchaseOrder) => {
    setReceiveOrder(order);
    setView('deliveries');
  };
  const closeDelivery = () => {
    setReceiveOrder(null);
    setNewDelivery(false);
  };

  return (
    <div className="space-y-5">
      <Segmented<View>
        value={view}
        onChange={setView}
        options={[
          { value: 'stock', label: 'Stock', icon: <PackageSearch className="h-4 w-4" /> },
          { value: 'orders', label: 'Commandes', icon: <ShoppingCart className="h-4 w-4" /> },
          { value: 'deliveries', label: 'Livraisons', icon: <Truck className="h-4 w-4" /> },
          { value: 'consumption', label: 'Consommation', icon: <Boxes className="h-4 w-4" /> },
        ]}
      />
      {view === 'stock' && <StockSection projectId={projectId} permissions={permissions} />}
      {view === 'orders' && <OrderSection projectId={projectId} currency={project?.currency ?? 'GNF'} permissions={permissions} onReceive={receive} />}
      {view === 'deliveries' && <DeliverySection projectId={projectId} permissions={permissions} receiveOrder={receiveOrder} onReceiveDone={closeDelivery} onNew={() => setNewDelivery(true)} newOpen={newDelivery} />}
      {view === 'consumption' && <ConsumptionSection projectId={projectId} />}
    </div>
  );
}
