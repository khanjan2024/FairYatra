import { useState, useMemo, useRef } from 'react';
import {
  Car, Bike, Bus, UserCheck, UtensilsCrossed,
  ArrowRight, IndianRupee, AlertCircle, AlertTriangle,
  Send, RotateCcw, FileEdit, Heart, MessageSquarePlus,
  Star, Camera, X, ChevronDown, ChevronUp,
} from 'lucide-react';
import type { ServiceType, ReportType, EvidencePhoto } from '../types';
import { haversine } from '../lib/fare';
import { saveReport } from '../lib/storage';
import PlaceAutocomplete, { type SelectedPlace } from '../components/PlaceAutocomplete';
import benchmarksRaw from '../data/benchmarks.json';
import type { CityBenchmark } from '../types';

const benchmarks = benchmarksRaw.cities as CityBenchmark[];

const CITY_CENTRES = [
  { id: 'guwahati',  lat: 26.1445, lng: 91.7362 },
  { id: 'shillong',  lat: 25.5788, lng: 91.8933 },
  { id: 'gangtok',   lat: 27.3314, lng: 88.6138 },
  { id: 'tawang',    lat: 27.5860, lng: 91.8594 },
  { id: 'kaziranga', lat: 26.5775, lng: 93.1711 },
];
function cityFromCoords(lat: number, lng: number): string {
  let best = CITY_CENTRES[0]; let bestDist = Infinity;
  for (const c of CITY_CENTRES) {
    const d = haversine(lat, lng, c.lat, c.lng);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return bestDist <= 120 ? best.id : '';
}

const SERVICE_OPTIONS: { type: ServiceType; label: string; Icon: React.ElementType }[] = [
  { type: 'taxi',       label: 'Taxi',       Icon: Car             },
  { type: 'auto',       label: 'Auto',       Icon: Bike            },
  { type: 'shared_cab', label: 'Shared Cab', Icon: Bus             },
  { type: 'guide',      label: 'Guide',      Icon: UserCheck       },
  { type: 'restaurant', label: 'Restaurant', Icon: UtensilsCrossed },
];

const REPORT_TYPES: { value: ReportType; label: string; desc: string; color: string }[] = [
  { value: 'fare',      label: 'Fare Report', desc: 'Price you were quoted vs paid', color: 'blue'   },
  { value: 'complaint', label: 'Complaint',   desc: 'Rude driver, unsafe ride, detour…', color: 'red'    },
  { value: 'review',    label: 'Review',      desc: 'Rate your overall experience',  color: 'green'  },
  { value: 'scam_tip',  label: 'Scam Tip',    desc: 'Warn others about a new scam',  color: 'orange' },
];

const COMPLAINT_TYPES = [
  { value: 'rude_driver',    label: 'Rude or aggressive driver' },
  { value: 'unsafe',         label: 'Unsafe driving / condition' },
  { value: 'detour',         label: 'Unnecessary detour taken' },
  { value: 'hidden_charge',  label: 'Hidden charges added' },
  { value: 'refused_meter',  label: 'Refused to use meter' },
  { value: 'overcharge',     label: 'Overcharged fare' },
  { value: 'other',          label: 'Other issue' },
];

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500';
const selectClass = inputClass + ' appearance-none';

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className="focus:outline-none focus:ring-1 focus:ring-blue-400 rounded">
          <Star size={28}
            className={`transition-colors ${
              n <= (hover || value) ? 'text-amber-400 fill-amber-400' : 'text-slate-300'
            }`} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB

export default function ReportPrice() {
  // ── Navigation ──
  const [reportType, setReportType] = useState<ReportType>('fare');

  // ── Location ──
  const [fromText,   setFromText]   = useState('');
  const [toText,     setToText]     = useState('');
  const [fromCoords, setFromCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [toCoords,   setToCoords]   = useState<{ lat: number; lng: number } | null>(null);

  // ── Service ──
  const [serviceType, setServiceType] = useState<ServiceType | ''>('');

  // ── Fare fields ──
  const [quotedFare,    setQuotedFare]    = useState('');
  const [paidFare,      setPaidFare]      = useState('');
  const [isOvercharged, setIsOvercharged] = useState(false);

  // ── Complaint ──
  const [complaintType, setComplaintType] = useState('');

  // ── Review ──
  const [rating, setRating] = useState(0);

  // ── Common ──
  const [title,         setTitle]         = useState('');
  const [note,          setNote]          = useState('');
  const [driverDetails, setDriverDetails] = useState('');
  const [photos,        setPhotos]        = useState<EvidencePhoto[]>([]);
  const [showAdvanced,  setShowAdvanced]  = useState(false);

  // ── State ──
  const [submitted, setSubmitted] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const city = useMemo(() => {
    if (fromCoords) return cityFromCoords(fromCoords.lat, fromCoords.lng);
    if (toCoords)   return cityFromCoords(toCoords.lat,   toCoords.lng);
    return '';
  }, [fromCoords, toCoords]);

  const cityServices =
    benchmarks.find((c) => c.id === city)?.services.map((s) => s.type) ??
    SERVICE_OPTIONS.map((o) => o.type);

  const handleFromSelect = (p: SelectedPlace) => setFromCoords({ lat: p.lat, lng: p.lng });
  const handleToSelect   = (p: SelectedPlace) => setToCoords({ lat: p.lat, lng: p.lng });

  // Photo picker
  const handlePhotoAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach((file) => {
      if (photos.length >= MAX_PHOTOS) return;
      if (file.size > MAX_PHOTO_BYTES) {
        setError(`Photo "${file.name}" is over 2 MB — please use a smaller image.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setPhotos((prev) => [
          ...prev.slice(0, MAX_PHOTOS - 1),
          { dataUrl: reader.result as string },
        ]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removePhoto = (i: number) =>
    setPhotos((prev) => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!serviceType) { setError('Please select a service type.'); return; }
    if (!fromText && !toText) { setError('Enter at least a pickup or destination.'); return; }

    if (reportType === 'fare') {
      if (!quotedFare || !paidFare) { setError('Please fill in both fare fields.'); return; }
    }
    if (reportType === 'review' && rating === 0) {
      setError('Please give a star rating.'); return;
    }
    if (reportType === 'complaint' && !complaintType) {
      setError('Please select a complaint type.'); return;
    }

    const quoted = parseFloat(quotedFare) || 0;
    const paid   = parseFloat(paidFare)   || 0;

    setSaving(true);
    try {
      await saveReport({
        type:          reportType,
        city:          city || 'unknown',
        serviceType:   serviceType as ServiceType,
        fromPlace:     fromText,
        toPlace:       toText,
        quotedFare:    quoted,
        paidFare:      paid,
        isOvercharged,
        rating:        reportType === 'review' ? rating : undefined,
        complaintType: reportType === 'complaint' ? complaintType : undefined,
        title:         title.trim() || undefined,
        note:          note.trim()  || undefined,
        driverDetails: driverDetails.trim() || undefined,
        evidence:      photos.length > 0 ? photos : undefined,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSubmitted(false); setError(null);
    setFromText(''); setToText(''); setFromCoords(null); setToCoords(null);
    setServiceType(''); setQuotedFare(''); setPaidFare(''); setIsOvercharged(false);
    setComplaintType(''); setRating(0); setTitle(''); setNote('');
    setDriverDetails(''); setPhotos([]);
  };

  // ── Success ──
  if (submitted) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-5">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <Heart size={30} className="text-green-600" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Thank you!</h2>
        <p className="text-slate-500 text-sm">
          Your {reportType === 'fare' ? 'fare report' : reportType === 'complaint' ? 'complaint' : reportType === 'review' ? 'review' : 'scam tip'} has been saved
          and will help other travellers immediately.
        </p>
        <button onClick={handleReset}
          className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-800
            text-white font-semibold px-6 py-3 rounded-xl transition-colors">
          <RotateCcw size={15} aria-hidden="true" />
          Submit Another
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      {/* ── Header ── */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
          <FileEdit size={18} className="text-blue-700" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Community Report</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Share a fare, complaint, review, or scam tip. Stored locally on your device.
          </p>
        </div>
      </div>

      {/* ── Report type selector ── */}
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Report type">
        {REPORT_TYPES.map(({ value, label, desc, color }) => {
          const active = reportType === value;
          return (
            <button key={value} type="button" role="radio" aria-checked={active}
              onClick={() => { setReportType(value); setError(null); }}
              className={`text-left p-3 rounded-xl border-2 transition-all
                focus:outline-none focus:ring-2 focus:ring-blue-500
                ${active
                  ? `border-${color}-500 bg-${color}-50`
                  : 'border-slate-200 bg-white hover:border-slate-300'
                }`}>
              <p className={`text-sm font-semibold ${active ? `text-${color}-700` : 'text-slate-700'}`}>
                {label}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
            </button>
          );
        })}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>

        {/* ── From / To / Location ── */}
        {serviceType === 'guide' || serviceType === 'restaurant' ? (
          <PlaceAutocomplete id="r-from" label="Location"
            value={fromText}
            onChange={(v) => { setFromText(v); if (!v) setFromCoords(null); }}
            onPlaceSelect={handleFromSelect}
            placeholder="Temple, restaurant, market…" />
        ) : (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <PlaceAutocomplete id="r-from" label="Pickup" value={fromText}
                onChange={(v) => { setFromText(v); if (!v) setFromCoords(null); }}
                onPlaceSelect={handleFromSelect}
                placeholder="Where were you?" />
            </div>
            <ArrowRight size={16} className="text-slate-400 mb-3 shrink-0" aria-hidden="true" />
            <div className="flex-1">
              <PlaceAutocomplete id="r-to" label="Destination" value={toText}
                onChange={(v) => { setToText(v); if (!v) setToCoords(null); }}
                onPlaceSelect={handleToSelect}
                placeholder="Where did you go?" />
            </div>
          </div>
        )}

        {city && (
          <div className="-mt-2">
            <span className="text-xs font-semibold text-blue-700 bg-blue-50
              border border-blue-200 px-2 py-0.5 rounded-full">
              📍 {benchmarks.find((c) => c.id === city)?.name ?? city}
            </span>
          </div>
        )}

        {/* ── Service type ── */}
        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">Service Type *</p>
          <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Service type">
            {SERVICE_OPTIONS.filter((o) => !city || cityServices.includes(o.type))
              .map(({ type, label, Icon }) => {
                const active = serviceType === type;
                return (
                  <button key={type} type="button" role="radio" aria-checked={active}
                    onClick={() => {
                      setServiceType(type);
                      if (type === 'guide' || type === 'restaurant') {
                        setToText(''); setToCoords(null);
                      }
                    }}
                    className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl
                      border-2 text-xs font-medium transition-all focus:outline-none
                      focus:ring-2 focus:ring-blue-500
                      ${active
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                      }`}>
                    <Icon size={20} strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
                    <span className="leading-tight text-center">{label}</span>
                  </button>
                );
              })}
          </div>
        </div>

        {/* ── FARE fields ── */}
        {reportType === 'fare' && (
          <div className="space-y-3 bg-blue-50 border border-blue-200 rounded-xl p-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1"
                  htmlFor="r-quoted">Quoted Price (₹) *</label>
                <div className="relative">
                  <IndianRupee size={13} className="absolute left-3 top-1/2 -translate-y-1/2
                    text-slate-400 pointer-events-none" aria-hidden="true" />
                  <input id="r-quoted" type="number" min="1" step="1" inputMode="numeric"
                    placeholder="Asked" value={quotedFare}
                    onChange={(e) => setQuotedFare(e.target.value)}
                    className={`${inputClass} pl-7 text-sm`} required />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1"
                  htmlFor="r-paid">Paid Price (₹) *</label>
                <div className="relative">
                  <IndianRupee size={13} className="absolute left-3 top-1/2 -translate-y-1/2
                    text-slate-400 pointer-events-none" aria-hidden="true" />
                  <input id="r-paid" type="number" min="1" step="1" inputMode="numeric"
                    placeholder="Paid" value={paidFare}
                    onChange={(e) => setPaidFare(e.target.value)}
                    className={`${inputClass} pl-7 text-sm`} required />
                </div>
              </div>
            </div>
            <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={isOvercharged}
                onChange={(e) => setIsOvercharged(e.target.checked)}
                className="rounded accent-red-600 w-4 h-4 shrink-0" />
              <AlertTriangle size={14}
                className={isOvercharged ? 'text-red-500 shrink-0' : 'text-slate-400 shrink-0'}
                aria-hidden="true" />
              I felt I was overcharged
            </label>
          </div>
        )}

        {/* ── COMPLAINT type ── */}
        {reportType === 'complaint' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1"
              htmlFor="r-complaint">Issue Type *</label>
            <select id="r-complaint" value={complaintType}
              onChange={(e) => setComplaintType(e.target.value)}
              className={selectClass} required>
              <option value="">Select an issue…</option>
              {COMPLAINT_TYPES.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        )}

        {/* ── REVIEW stars ── */}
        {reportType === 'review' && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
            <p className="text-sm font-medium text-slate-700">Overall Rating *</p>
            <StarRating value={rating} onChange={setRating} />
            {rating > 0 && (
              <p className="text-xs text-amber-700 font-medium">
                {['', 'Very bad', 'Poor', 'Okay', 'Good', 'Excellent'][rating]}
              </p>
            )}
          </div>
        )}

        {/* ── SCAM TIP hint ── */}
        {reportType === 'scam_tip' && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-xs text-orange-800">
            Describe the scam in the notes below — what happened, what they charged,
            and how to avoid it. Add a title so it's easy to find.
          </div>
        )}

        {/* ── Title ── */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="r-title">
            Short title (optional)
          </label>
          <input id="r-title" type="text" maxLength={80}
            placeholder={
              reportType === 'fare'      ? 'e.g. Overcharged from airport' :
              reportType === 'complaint' ? 'e.g. Driver took wrong route'  :
              reportType === 'review'    ? 'e.g. Great ride, fair price'   :
              'e.g. Fake entry ticket at waterfall'
            }
            value={title} onChange={(e) => setTitle(e.target.value)}
            className={inputClass} />
        </div>

        {/* ── Notes ── */}
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <MessageSquarePlus size={13} className="text-slate-400" aria-hidden="true" />
            <label className="text-sm font-medium text-slate-700" htmlFor="r-note">
              Details {reportType === 'scam_tip' ? '*' : '(optional)'}
            </label>
          </div>
          <textarea id="r-note" rows={3}
            placeholder="What happened? The more detail, the more useful it is for others…"
            value={note} onChange={(e) => setNote(e.target.value)}
            className={`${inputClass} resize-none`} maxLength={500} />
          <p className="text-xs text-slate-400 text-right mt-0.5">{note.length}/500</p>
        </div>

        {/* ── Advanced (driver details + photos) ── */}
        <div>
          <button type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800
              font-medium focus:outline-none">
            {showAdvanced
              ? <ChevronUp   size={15} aria-hidden="true" />
              : <ChevronDown size={15} aria-hidden="true" />}
            Add vehicle details & photos
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
              {/* Driver / vehicle */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1"
                  htmlFor="r-driver">
                  Vehicle number or driver description (optional)
                </label>
                <input id="r-driver" type="text" maxLength={80}
                  placeholder="e.g. AS01 AB 1234, white Maruti"
                  value={driverDetails}
                  onChange={(e) => setDriverDetails(e.target.value)}
                  className={inputClass} />
              </div>

              {/* Photo evidence */}
              <div>
                <p className="text-xs font-medium text-slate-600 mb-2">
                  Photo evidence ({photos.length}/{MAX_PHOTOS})
                </p>

                {/* Photo thumbnails */}
                {photos.length > 0 && (
                  <div className="flex gap-2 flex-wrap mb-2">
                    {photos.map((p, i) => (
                      <div key={i} className="relative">
                        <img src={p.dataUrl} alt={`Evidence ${i + 1}`}
                          className="w-20 h-20 object-cover rounded-lg border border-slate-200" />
                        <button type="button" onClick={() => removePhoto(i)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full
                            bg-red-500 text-white flex items-center justify-center
                            focus:outline-none shadow"
                          aria-label={`Remove photo ${i + 1}`}>
                          <X size={10} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {photos.length < MAX_PHOTOS && (
                  <>
                    <button type="button"
                      onClick={() => fileRef.current?.click()}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl border-2
                        border-dashed border-slate-300 text-sm text-slate-500
                        hover:border-blue-400 hover:text-blue-600 transition-colors
                        focus:outline-none focus:ring-2 focus:ring-blue-500 w-full
                        justify-center">
                      <Camera size={16} aria-hidden="true" />
                      Add photo {photos.length > 0 ? 'another' : ''}(max 2 MB each)
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" multiple
                      className="hidden" onChange={handlePhotoAdd}
                      aria-label="Upload photo evidence" />
                  </>
                )}
                <p className="text-xs text-slate-400 mt-1">
                  Screenshots of receipts, meters, or WhatsApp chats are great evidence.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Error ── */}
        {error && (
          <div role="alert"
            className="flex items-start gap-2 text-sm text-red-700 bg-red-50
              border border-red-200 rounded-xl px-3 py-2.5">
            <AlertCircle size={15} className="shrink-0 mt-0.5 text-red-500" aria-hidden="true" />
            {error}
          </div>
        )}

        {/* ── Submit ── */}
        <button type="submit"
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 bg-blue-700
            hover:bg-blue-800 disabled:opacity-60 text-white font-semibold py-3 rounded-xl
            transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
          {saving ? (
            <span className="w-4 h-4 border-2 border-white border-t-transparent
              rounded-full animate-spin" aria-hidden="true" />
          ) : (
            <Send size={15} aria-hidden="true" />
          )}
          {saving ? 'Submitting…' : `Submit ${reportType === 'fare' ? 'Fare Report' : reportType === 'complaint' ? 'Complaint' : reportType === 'review' ? 'Review' : 'Scam Tip'}`}
        </button>
      </form>
    </div>
  );
}
