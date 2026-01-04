import { useState } from 'react';
import { CrossPlatformMatch } from '@/types/dome';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ChevronDown, 
  ChevronUp, 
  Target, 
  User, 
  Hash, 
  Calendar, 
  Tag, 
  Percent,
  AlertTriangle,
  Flag
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface MatchDetailsPanelProps {
  match: CrossPlatformMatch;
  onReportMismatch?: () => void;
}

// Device ID for tracking (stored in localStorage)
function getDeviceId(): string {
  let deviceId = localStorage.getItem('dome_device_id');
  if (!deviceId) {
    deviceId = 'dev_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem('dome_device_id', deviceId);
  }
  return deviceId;
}

export function MatchDetailsPanel({ match, onReportMismatch }: MatchDetailsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [showReportForm, setShowReportForm] = useState(false);

  const handleReportMismatch = async () => {
    if (!reportReason.trim()) {
      toast.error('Please provide a reason for the mismatch');
      return;
    }

    setIsReporting(true);
    try {
      const { error } = await supabase.from('mismatch_reports').insert({
        device_id: getDeviceId(),
        polymarket_id: match.polymarket.id,
        polymarket_title: match.polymarket.title,
        polymarket_slug: match.polymarket.marketSlug || null,
        kalshi_id: match.kalshi.id,
        kalshi_title: match.kalshi.title,
        kalshi_ticker: match.kalshi.kalshiMarketTicker || null,
        match_score: match.matchScore,
        match_reason: match.matchReason,
        report_reason: reportReason.trim(),
      });

      if (error) throw error;

      toast.success('Mismatch reported! Thanks for helping improve matching accuracy.');
      setShowReportForm(false);
      setReportReason('');
      onReportMismatch?.();
    } catch (error) {
      console.error('Failed to report mismatch:', error);
      toast.error('Failed to submit report. Please try again.');
    } finally {
      setIsReporting(false);
    }
  };

  // Parse match reason into components
  const reasonParts = match.matchReason.split(' + ');

  // Extract detailed scoring info from reason
  const getScoreDetails = () => {
    const details: { label: string; value: string; icon: React.ReactNode; color: string }[] = [];
    
    for (const part of reasonParts) {
      if (part.includes('base event')) {
        const pct = part.match(/(\d+)%/)?.[1] || '?';
        details.push({ label: 'Base Event', value: `${pct}%`, icon: <Target className="w-3 h-3" />, color: 'text-blue-500' });
      } else if (part.includes('title')) {
        const pct = part.match(/(\d+)%/)?.[1] || '?';
        details.push({ label: 'Title Match', value: `${pct}%`, icon: <Hash className="w-3 h-3" />, color: 'text-purple-500' });
      } else if (part.includes('entities')) {
        const pct = part.match(/(\d+)%/)?.[1] || '?';
        details.push({ label: 'Entity Overlap', value: `${pct}%`, icon: <User className="w-3 h-3" />, color: 'text-amber-500' });
      } else if (part.includes('ticker')) {
        details.push({ label: 'Ticker Match', value: 'Yes', icon: <Tag className="w-3 h-3" />, color: 'text-green-500' });
      } else if (part.includes('bracket')) {
        details.push({ label: 'Bracket Match', value: 'Yes', icon: <Percent className="w-3 h-3" />, color: 'text-cyan-500' });
      } else if (part.includes('category')) {
        details.push({ label: 'Same Category', value: 'Yes', icon: <Tag className="w-3 h-3" />, color: 'text-indigo-500' });
      } else if (part.includes('timeframe')) {
        details.push({ label: 'Same Timeframe', value: 'Yes', icon: <Calendar className="w-3 h-3" />, color: 'text-teal-500' });
      }
    }

    // If no parsed details, show raw score
    if (details.length === 0) {
      const pct = match.matchReason.match(/(\d+)%/)?.[1];
      if (pct) {
        details.push({ label: 'Overall Score', value: `${pct}%`, icon: <Target className="w-3 h-3" />, color: 'text-muted-foreground' });
      }
    }

    return details;
  };

  const scoreDetails = getScoreDetails();
  const confidence = Math.round(match.matchScore * 100);
  const confidenceColor = confidence >= 70 ? 'text-green-500' : confidence >= 50 ? 'text-amber-500' : 'text-red-500';

  return (
    <div className="border-t border-border/50 pt-2 mt-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
      >
        <span className="flex items-center gap-1.5">
          <Target className="w-3 h-3" />
          Match Details
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${confidenceColor}`}>
            {confidence}% confidence
          </Badge>
        </span>
        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {isExpanded && (
        <div className="mt-2 space-y-3 animate-in slide-in-from-top-2 duration-200">
          {/* Score Breakdown */}
          <div className="grid grid-cols-2 gap-2">
            {scoreDetails.map((detail, idx) => (
              <div 
                key={idx} 
                className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 text-xs"
              >
                <span className={detail.color}>{detail.icon}</span>
                <span className="text-muted-foreground">{detail.label}:</span>
                <span className="font-medium">{detail.value}</span>
              </div>
            ))}
          </div>

          {/* Title Comparison */}
          <div className="space-y-1.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Title Comparison</p>
            <div className="grid gap-1.5">
              <div className="p-2 rounded-lg bg-purple-500/10 text-xs">
                <span className="text-purple-400 font-medium">Polymarket: </span>
                <span className="text-foreground">{match.polymarket.title}</span>
              </div>
              <div className="p-2 rounded-lg bg-blue-500/10 text-xs">
                <span className="text-blue-400 font-medium">Kalshi: </span>
                <span className="text-foreground">{match.kalshi.title}</span>
              </div>
            </div>
          </div>

          {/* Expiration Dates */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">Poly ends:</span>
              <span>{match.polymarket.endTime.toLocaleDateString()}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">Kalshi ends:</span>
              <span>{match.kalshi.endTime.toLocaleDateString()}</span>
            </div>
          </div>

          {/* Report Mismatch Section */}
          {!showReportForm ? (
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-8 text-xs text-muted-foreground hover:text-destructive"
              onClick={() => setShowReportForm(true)}
            >
              <Flag className="w-3 h-3 mr-1.5" />
              Report Incorrect Match
            </Button>
          ) : (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 space-y-2">
              <div className="flex items-center gap-2 text-xs text-destructive">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span className="font-medium">Report Mismatch</span>
              </div>
              <textarea
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="Why is this match incorrect? (e.g., 'Different events', 'Wrong time period', 'Different outcomes')"
                className="w-full h-16 text-xs p-2 rounded-md bg-background border border-border resize-none"
                maxLength={500}
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 text-xs flex-1"
                  onClick={handleReportMismatch}
                  disabled={isReporting || !reportReason.trim()}
                >
                  {isReporting ? 'Submitting...' : 'Submit Report'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setShowReportForm(false);
                    setReportReason('');
                  }}
                >
                  Cancel
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Your report helps improve our matching algorithm for everyone.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
