import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { reviews as reviewsApi, comments as commentsApi } from '../api/client';

function scoreColor(score) {
  if (score >= 61) return '#22C55E';
  if (score >= 40) return '#FACC15';
  return '#EF4444';
}

// ── External critic review card (read-only, with attribution) ─────────────────

function ExternalCriticCard({ review }) {
  const { i18n, t } = useTranslation();
  const lang = i18n.language;
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-start gap-3">
        {/* Score */}
        <span
          className="text-2xl font-bold tabular-nums shrink-0"
          style={{ color: scoreColor(review.score) }}
        >
          {review.score}
        </span>

        <div className="flex-1 min-w-0">
          {/* Publication + reviewer */}
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="bg-gray-800 text-gray-200 text-xs font-bold px-2 py-0.5 rounded">
              {review.publication}
            </span>
            {review.reviewerName && (
              <span className="text-xs text-gray-400">{review.reviewerName}</span>
            )}
          </div>

          {/* Score raw + date */}
          <p className="text-xs text-gray-600 mb-2">
            {review.scoreRaw}
            {review.createdAt && (
              <> · {new Date(review.createdAt).toLocaleDateString(lang === 'ja' ? 'ja-JP' : 'en-US')}</>
            )}
          </p>

          {/* Excerpt */}
          {review.excerpt && (
            <p className="text-sm text-gray-400 italic leading-relaxed mb-3">
              "{review.excerpt}"
            </p>
          )}

          {/* Read full review link */}
          <a
            href={review.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-purple-400 hover:text-purple-300 transition-colors"
          >
            {t('review.read_full')} →
          </a>
        </div>
      </div>
    </div>
  );
}

export default function ReviewCard({ review, titleId, currentUserId, currentUsername, onDeleted }) {
  const { i18n, t } = useTranslation();

  // External critic reviews get their own read-only card
  if (review.source === 'critic-external') {
    return <ExternalCriticCard review={review} />;
  }

  const [item, setItem] = useState(review);
  const [translating, setTranslating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editScore, setEditScore] = useState(review.score);
  const [editBody, setEditBody] = useState(
    review.language === 'ja' ? (review.bodyJa || review.bodyEn || '') : (review.bodyEn || review.bodyJa || '')
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Comments
  const [commentsList, setCommentsList] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  const lang = i18n.language;
  const isOwn = item.source === 'user' && currentUserId && item.userId === currentUserId;

  const body = lang === 'ja'
    ? (item.bodyJa || item.bodyEn)
    : (item.bodyEn || item.bodyJa);

  const canTranslate = lang === 'ja' ? (!item.bodyJa && item.bodyEn) : (!item.bodyEn && item.bodyJa);

  useEffect(() => {
    commentsApi.list(titleId, item.reviewId)
      .then((res) => setCommentsList(res.data.items || []))
      .catch(() => {});
  }, [titleId, item.reviewId]);

  const handleTranslate = async () => {
    setTranslating(true);
    try {
      const res = await reviewsApi.translate(titleId, item.reviewId, lang);
      setItem(res.data);
    } catch (err) {
      console.error('Translation failed:', err);
    } finally {
      setTranslating(false);
    }
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const bodyField = item.language === 'ja' ? { bodyJa: editBody } : { bodyEn: editBody };
      const res = await reviewsApi.update(titleId, item.reviewId, {
        score: parseInt(editScore, 10),
        ...bodyField,
      });
      setItem(res.data);
      setEditing(false);
    } catch (err) {
      console.error('Update failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await reviewsApi.remove(titleId, item.reviewId);
      onDeleted?.(item.reviewId);
    } catch (err) {
      console.error('Delete failed:', err);
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setSubmittingComment(true);
    try {
      const res = await commentsApi.post(titleId, item.reviewId, {
        text: commentText.trim(),
        displayName: currentUsername,
      });
      setCommentsList((prev) => [...prev, res.data]);
      setCommentText('');
    } catch (err) {
      console.error('Comment failed:', err);
    } finally {
      setSubmittingComment(false);
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold tabular-nums" style={{ color: scoreColor(item.score) }}>
            {item.score}
          </span>
          <div>
            <p className="text-xs font-medium text-gray-300">
              {item.source === 'critic'
                ? t('review.critic_label')
                : (item.displayName || (isOwn ? currentUsername : null) || t('review.user_label'))}
            </p>
            <p className="text-xs text-gray-600">
              {new Date(item.createdAt).toLocaleDateString(lang === 'ja' ? 'ja-JP' : 'en-US')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canTranslate && !editing && (
            <button
              onClick={handleTranslate}
              disabled={translating}
              className="text-xs bg-purple-900/60 hover:bg-purple-800/80 text-purple-300 px-3 py-1 rounded-full transition-colors disabled:opacity-50"
            >
              {translating ? t('review.translating') : t('review.translate')}
            </button>
          )}
          {isOwn && !editing && (
            <>
              <button
                onClick={() => setEditing(true)}
                className="text-xs text-gray-500 hover:text-purple-400 transition-colors px-2 py-1 rounded"
              >
                {t('review.edit')}
              </button>
              {confirmDelete ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="text-xs text-red-400 hover:text-red-300 font-semibold px-2 py-1 rounded disabled:opacity-50"
                  >
                    {deleting ? '…' : t('review.confirm_delete')}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-xs text-gray-500 hover:text-gray-300 px-1"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-xs text-gray-500 hover:text-red-400 transition-colors px-2 py-1 rounded"
                >
                  {t('review.delete')}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">{t('review.score')}</label>
            <div className="flex items-center gap-3">
              <input
                type="range" min="0" max="100"
                value={editScore}
                onChange={(e) => setEditScore(e.target.value)}
                className="flex-1 accent-purple-500"
              />
              <span
                className="text-lg font-bold w-10 text-right tabular-nums"
                style={{ color: editScore >= 61 ? '#22C55E' : editScore >= 40 ? '#FACC15' : '#EF4444' }}
              >
                {editScore}
              </span>
            </div>
          </div>
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={4}
            className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-purple-500 resize-none text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSaveEdit}
              disabled={saving}
              className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? '…' : t('review.save_edit')}
            </button>
            <button
              onClick={() => { setEditing(false); setEditScore(item.score); }}
              className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm px-4 py-1.5 rounded-lg transition-colors"
            >
              {t('review.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-300 leading-relaxed">{body}</p>
      )}

      {/* Comments */}
      <div className="mt-4 pt-3 border-t border-gray-800 space-y-3">
        {commentsList.length > 0 && (
          <div className="space-y-2">
            {commentsList.map((c) => (
              <div key={c.commentId} className="flex gap-2">
                <span className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-300 shrink-0">
                  {c.authorName?.[0]?.toUpperCase() || 'U'}
                </span>
                <div>
                  <span className="text-xs font-medium text-gray-400 mr-1.5">{c.authorName}</span>
                  <span className="text-xs text-gray-300">{c.text}</span>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {new Date(c.createdAt).toLocaleDateString(lang === 'ja' ? 'ja-JP' : 'en-US')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {currentUserId ? (
          <form onSubmit={handleCommentSubmit} className="flex gap-2">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={t('comment.placeholder')}
              className="flex-1 bg-gray-800 text-white text-sm rounded-lg px-3 py-1.5 border border-gray-700 focus:outline-none focus:border-purple-500"
            />
            <button
              type="submit"
              disabled={submittingComment || !commentText.trim()}
              className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {submittingComment ? '…' : t('comment.submit')}
            </button>
          </form>
        ) : (
          <p className="text-xs text-gray-600">{t('comment.login_to_comment')}</p>
        )}
      </div>
    </div>
  );
}
