import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { slide } from '@remotion/transitions/slide';
import { fade } from '@remotion/transitions/fade';
import { wipe } from '@remotion/transitions/wipe';

// Import all detailed scenes
import { OpeningScene } from './detailed-scenes/OpeningScene';
import { ProblemScene } from './detailed-scenes/ProblemScene';
import { SolutionIntro } from './detailed-scenes/SolutionIntro';
import { Feature_AIParser } from './detailed-scenes/Feature_AIParser';
import { Feature_Partnerships } from './detailed-scenes/Feature_Partnerships';
import { Feature_Tasks } from './detailed-scenes/Feature_Tasks';
import { Feature_Analytics } from './detailed-scenes/Feature_Analytics';
import { Feature_Notifications } from './detailed-scenes/Feature_Notifications';
import { Feature_Chatbot } from './detailed-scenes/Feature_Chatbot';
import { Feature_Communications } from './detailed-scenes/Feature_Communications';
import { ROIScene } from './detailed-scenes/ROIScene';
import { CTAScene } from './detailed-scenes/CTAScene';

/**
 * Full Product Demo Video - 3 דקות מפורטות
 * 
 * Structure:
 * 1. Opening (5s)
 * 2. Problem (10s)
 * 3. Solution Intro (8s)
 * 4. AI Parser Deep Dive (20s)
 * 5. Partnerships Management (18s)
 * 6. Tasks & Calendar (15s)
 * 7. Analytics Dashboards (18s)
 * 8. Notifications Engine (12s)
 * 9. Chatbot & Followers (15s)
 * 10. Communications Hub (12s)
 * 11. ROI & Results (15s)
 * 12. CTA (12s)
 * 
 * Total: ~160 seconds (4800 frames @ 30fps)
 */

export const FullPromoVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <TransitionSeries>
        
        {/* 1. OPENING - Logo reveal (5s / 150 frames) */}
        <TransitionSeries.Sequence durationInFrames={150}>
          <OpeningScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />

        {/* 2. PROBLEM - Admin Hell (10s / 300 frames) */}
        <TransitionSeries.Sequence durationInFrames={300}>
          <ProblemScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: 'from-bottom' })}
          timing={linearTiming({ durationInFrames: 20 })}
        />

        {/* 3. SOLUTION INTRO (8s / 240 frames) */}
        <TransitionSeries.Sequence durationInFrames={240}>
          <SolutionIntro />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={wipe({ direction: 'from-right' })}
          timing={linearTiming({ durationInFrames: 20 })}
        />

        {/* 4. FEATURE: AI PARSER (20s / 600 frames) */}
        <TransitionSeries.Sequence durationInFrames={600}>
          <Feature_AIParser />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: 'from-left' })}
          timing={linearTiming({ durationInFrames: 20 })}
        />

        {/* 5. FEATURE: PARTNERSHIPS (18s / 540 frames) */}
        <TransitionSeries.Sequence durationInFrames={540}>
          <Feature_Partnerships />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />

        {/* 6. FEATURE: TASKS (15s / 450 frames) */}
        <TransitionSeries.Sequence durationInFrames={450}>
          <Feature_Tasks />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={wipe({ direction: 'from-left' })}
          timing={linearTiming({ durationInFrames: 20 })}
        />

        {/* 7. FEATURE: ANALYTICS (18s / 540 frames) */}
        <TransitionSeries.Sequence durationInFrames={540}>
          <Feature_Analytics />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: 'from-right' })}
          timing={linearTiming({ durationInFrames: 20 })}
        />

        {/* 8. FEATURE: NOTIFICATIONS (12s / 360 frames) */}
        <TransitionSeries.Sequence durationInFrames={360}>
          <Feature_Notifications />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />

        {/* 9. FEATURE: CHATBOT (15s / 450 frames) */}
        <TransitionSeries.Sequence durationInFrames={450}>
          <Feature_Chatbot />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: 'from-top' })}
          timing={linearTiming({ durationInFrames: 20 })}
        />

        {/* 10. FEATURE: COMMUNICATIONS (12s / 360 frames) */}
        <TransitionSeries.Sequence durationInFrames={360}>
          <Feature_Communications />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={wipe({ direction: 'from-bottom' })}
          timing={linearTiming({ durationInFrames: 20 })}
        />

        {/* 11. ROI & RESULTS (15s / 450 frames) */}
        <TransitionSeries.Sequence durationInFrames={450}>
          <ROIScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 20 })}
        />

        {/* 12. CTA FINALE (12s / 360 frames) */}
        <TransitionSeries.Sequence durationInFrames={360}>
          <CTAScene />
        </TransitionSeries.Sequence>

      </TransitionSeries>
    </AbsoluteFill>
  );
};
