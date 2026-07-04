'use client';

import dynamic from 'next/dynamic';
import 'swagger-ui-react/swagger-ui.css';

const SwaggerUI = dynamic(() => import('swagger-ui-react'), { ssr: false });

export function SwaggerUIClient() {
  return (
    <div className="h-dvh overflow-y-auto" style={{ background: '#fff', color: '#3b4151' }}>
      <SwaggerUI url="/api/openapi" />
    </div>
  );
}
