import React from 'react';
import { Composition } from 'remotion';
import { PromoVideo } from './PromoVideo';
import { FullPromoVideo } from './FullPromoVideo';

export const Root: React.FC = () => {
  return (
    <>
      {/* Short Version - 17 seconds */}
      <Composition
        id="Short"
        component={PromoVideo}
        durationInFrames={510}
        fps={30}
        width={1920}
        height={1080}
      />
      
      {/* Full Product Demo - 2.5 minutes */}
      <Composition
        id="FullDemo"
        component={FullPromoVideo}
        durationInFrames={4590}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
