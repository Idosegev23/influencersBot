import React from 'react';
import { AbsoluteFill } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { slide } from '@remotion/transitions/slide';
import { fade } from '@remotion/transitions/fade';
import { wipe } from '@remotion/transitions/wipe';

import { Scene1_Problem } from './scenes/Scene1_Problem';
import { Scene2_Solution } from './scenes/Scene2_Solution';
import { Scene3_AI } from './scenes/Scene3_AI';
import { Scene4_Features } from './scenes/Scene4_Features';
import { Scene5_Dashboard } from './scenes/Scene5_Dashboard';
import { Scene6_Automation } from './scenes/Scene6_Automation';
import { Scene7_CTA } from './scenes/Scene7_CTA';

export const PromoVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <TransitionSeries>
        
        {/* Scene 1: The Problem - כאוס (3 sec / 90 frames) */}
        <TransitionSeries.Sequence durationInFrames={90}>
          <Scene1_Problem />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: 'from-bottom' })}
          timing={linearTiming({ durationInFrames: 20 })}
        />

        {/* Scene 2: The Solution - Influencer OS (2.5 sec / 75 frames) */}
        <TransitionSeries.Sequence durationInFrames={75}>
          <Scene2_Solution />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />

        {/* Scene 3: AI Magic - Document Parsing (3.5 sec / 105 frames) */}
        <TransitionSeries.Sequence durationInFrames={105}>
          <Scene3_AI />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={wipe({ direction: 'from-left' })}
          timing={linearTiming({ durationInFrames: 20 })}
        />

        {/* Scene 4: Features Grid (3 sec / 90 frames) */}
        <TransitionSeries.Sequence durationInFrames={90}>
          <Scene4_Features />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: 'from-right' })}
          timing={linearTiming({ durationInFrames: 15 })}
        />

        {/* Scene 5: Dashboard (3 sec / 90 frames) */}
        <TransitionSeries.Sequence durationInFrames={90}>
          <Scene5_Dashboard />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />

        {/* Scene 6: Automation & ROI (2.5 sec / 75 frames) */}
        <TransitionSeries.Sequence durationInFrames={75}>
          <Scene6_Automation />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: 'from-top' })}
          timing={linearTiming({ durationInFrames: 20 })}
        />

        {/* Scene 7: CTA (2.5 sec / 75 frames) */}
        <TransitionSeries.Sequence durationInFrames={75}>
          <Scene7_CTA />
        </TransitionSeries.Sequence>

      </TransitionSeries>
    </AbsoluteFill>
  );
};
