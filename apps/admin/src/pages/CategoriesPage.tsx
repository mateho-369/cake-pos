import { useState } from 'react'
import { ChevronDown, ChevronUp, GripVertical, Plus, Tags } from 'lucide-react'
import type { Category } from '../data'
import { useAdminData } from '../lib/data'
import Modal from '../components/Modal'
import { translateCategory, useTranslation } from '../lib/i18n'

const colorOptions = ['#be185d', '#3b82f6', '#d97706', '#7c3aed', '#059669']

export default function CategoriesPage({
  onToast,
}: {
  onToast: (message: string) => void
}) {
  const { t } = useTranslation()
  const { categories, createCategory, updateCategory } = useAdminData()
  const totalRevenue = categories.reduce(
    (sum, category) => sum + category.revenue,
    0,
  )
  const maxRevenue = categories.reduce(
    (max, category) => Math.max(max, category.revenue),
    0,
  )
  const topCategory = categories.reduce<Category | null>(
    (top, category) =>
      category.revenue > (top?.revenue ?? 0) ? category : top,
    null,
  )
  const topRevenue = topCategory?.revenue ?? 0
  const topShare = totalRevenue > 0 ? (topRevenue / totalRevenue) * 100 : 0
  const totalItems = categories.reduce(
    (sum, category) => sum + category.items,
    0,
  )
  const topProductShare =
    totalItems > 0 && topCategory ? (topCategory.items / totalItems) * 100 : 0
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [saving, setSaving] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  // Top-level categories only — subcategories cannot have children (the API
  // enforces the same one-level rule server-side).
  const topLevel = categories.filter((item) => !item.parentId)

  const submitCategory = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true)
    try {
      const parent = String(form.get('parentCategoryId') || '')
      await createCategory({
        name: String(form.get('name') || ''),
        color: String(form.get('color') || '#be185d'),
        active: form.get('active') === 'on',
        parentCategoryId: parent ? Number(parent) : null,
      })
      setCreateOpen(false)
      onToast(t('categories.created'))
    } catch (reason) {
      onToast(reason instanceof Error ? reason.message : t('categories.failed'))
    } finally {
      setSaving(false)
    }
  }

  const submitEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    if (!editing) return
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true)
    try {
      const parent = String(form.get('parentCategoryId') || '')
      await updateCategory(editing.id, {
        name: String(form.get('name') || editing.name),
        color: String(form.get('color') || editing.color),
        active: form.get('active') === 'on',
        parentCategoryId: parent ? Number(parent) : null,
      })
      setEditing(null)
      onToast(t('categories.updated'))
    } catch (reason) {
      onToast(reason instanceof Error ? reason.message : t('categories.failed'))
    } finally {
      setSaving(false)
    }
  }

  const persistOrder = async (next: Category[]) => {
    try {
      await Promise.all(
        next.map((category, index) =>
          category.sortOrder === index
            ? Promise.resolve(category)
            : updateCategory(category.id, { sortOrder: index }),
        ),
      )
      onToast(t('categories.reordered'))
    } catch (reason) {
      onToast(reason instanceof Error ? reason.message : t('categories.failed'))
    }
  }

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= categories.length) return
    const next = [...categories]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    void persistOrder(next)
  }

  const onDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null)
      return
    }
    const next = [...categories]
    const [item] = next.splice(dragIndex, 1)
    next.splice(targetIndex, 0, item)
    setDragIndex(null)
    void persistOrder(next)
  }

  return (
    <div className="page-content">
      <section className="page-toolbar">
        <div className="toolbar-context">
          <strong>{t('categories.organization')}</strong>
          <span>{t('categories.drag')}</span>
        </div>
        <button className="primary-button" onClick={() => setCreateOpen(true)}>
          <Plus size={17} /> {t('categories.new')}
        </button>
      </section>
      <section className="categories-layout">
        <div className="glass-panel category-list-card">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">
                {t('categories.displayOrder')}
              </span>
              <h2>{t('categories.category')}</h2>
            </div>
            <span className="count-label">
              {t('categories.count', { count: categories.length })}
            </span>
          </div>
          <div className="category-row category-head">
            <span />
            <span>{t('categories.category')}</span>
            <span>{t('categories.products')}</span>
            <span>{t('categories.active')}</span>
            <span>{t('categories.revenueToday')}</span>
            <span />
          </div>
          {categories.map((category, index) => (
            <div
              className={`category-row ${dragIndex === index ? 'dragging' : ''} ${category.parentId ? 'subcategory-row' : ''}`}
              key={category.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => onDrop(index)}
              onDragEnd={() => setDragIndex(null)}
            >
              <GripVertical size={17} className="drag-handle" />
              <div className="category-name">
                <i style={{ background: category.color }} />
                <div>
                  <strong>{translateCategory(t, category.name)}</strong>
                  <small>
                    {category.parentName
                      ? `${t('categories.underParent', {
                          parent: translateCategory(t, category.parentName),
                        })} · `
                      : ''}
                    {t('categories.position', { position: index + 1 })}
                  </small>
                </div>
              </div>
              <strong>{category.items}</strong>
              <span>{category.active}</span>
              <strong>${category.revenue.toLocaleString()}</strong>
              <div className="category-row-actions">
                <button
                  className="icon-button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={t('categories.moveUp')}
                  title={t('categories.moveUp')}
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  className="icon-button"
                  onClick={() => move(index, 1)}
                  disabled={index === categories.length - 1}
                  aria-label={t('categories.moveDown')}
                  title={t('categories.moveDown')}
                >
                  <ChevronDown size={16} />
                </button>
                <button
                  className="icon-button"
                  onClick={() => setEditing(category)}
                  aria-label={`${t('common.edit')} ${category.name}`}
                  title={t('common.edit')}
                >
                  <Tags size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <aside className="glass-panel category-insight">
          <div className="insight-icon">
            <Tags size={20} />
          </div>
          <span className="section-kicker">{t('categories.insight')}</span>
          {topCategory && topRevenue > 0 ? (
            <>
              <h2>
                {t('categories.leadCategory', {
                  name: translateCategory(t, topCategory.name),
                })}
              </h2>
              <p>
                {t('categories.insightText', {
                  percent: topShare.toFixed(1),
                  productPercent: topProductShare.toFixed(0),
                })}
              </p>
              <div className="category-bars">
                {categories.slice(0, 4).map((category) => (
                  <div key={category.id}>
                    <span>
                      <strong>{translateCategory(t, category.name)}</strong>
                      <small>${category.revenue.toLocaleString()}</small>
                    </span>
                    <i>
                      <b
                        style={{
                          width: `${
                            maxRevenue > 0
                              ? Math.min(
                                  100,
                                  (category.revenue / maxRevenue) * 100,
                                )
                              : 0
                          }%`,
                          background: category.color,
                        }}
                      />
                    </i>
                  </div>
                ))}
              </div>
              <div className="insight-note">
                <strong>{t('categories.recommendation')}</strong>
                <span>
                  {t('categories.recommendationText', {
                    name: translateCategory(t, topCategory.name),
                  })}
                </span>
              </div>
            </>
          ) : (
            <p>{t('categories.noData')}</p>
          )}
        </aside>
      </section>
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        eyebrow={t('categories.organization')}
        title={t('categories.createTitle')}
        size="small"
      >
        <form className="modal-form" onSubmit={submitCategory}>
          <div className="form-grid">
            <label>
              <span>{t('categories.categoryName')}</span>
              <input
                name="name"
                autoFocus
                placeholder={t('categories.seasonalPlaceholder')}
                required
              />
            </label>
            <label>
              <span>{t('categories.parentCategory')}</span>
              <select name="parentCategoryId" defaultValue="">
                <option value="">{t('categories.topLevel')}</option>
                {topLevel.map((item) => (
                  <option key={item.id} value={item.id}>
                    {translateCategory(t, item.name)}
                  </option>
                ))}
              </select>
              <small>{t('categories.parentHint')}</small>
            </label>
            <label>
              <span>{t('categories.accentColor')}</span>
              <div className="color-options">
                {colorOptions.map((color, index) => (
                  <input
                    key={color}
                    value={color}
                    type="radio"
                    name="color"
                    defaultChecked={index === 0}
                    style={{ '--swatch': color } as React.CSSProperties}
                  />
                ))}
              </div>
            </label>
            <label className="toggle-field">
              <span>
                <strong>{t('categories.activeSale')}</strong>
                <small>{t('categories.browseCategory')}</small>
              </span>
              <input name="active" type="checkbox" defaultChecked />
              <i />
            </label>
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setCreateOpen(false)}
            >
              {t('common.cancel')}
            </button>
            <button className="primary-button" disabled={saving}>
              <Plus size={16} /> {t('categories.createTitle')}
            </button>
          </div>
        </form>
      </Modal>
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        eyebrow={t('categories.organization')}
        title={t('categories.editTitle')}
        size="small"
      >
        {editing && (
          <form className="modal-form" onSubmit={submitEdit}>
            <div className="form-grid">
              <label>
                <span>{t('categories.categoryName')}</span>
                <input name="name" defaultValue={editing.name} required />
              </label>
              <label>
                <span>{t('categories.parentCategory')}</span>
                <select
                  name="parentCategoryId"
                  defaultValue={editing.parentId ? String(editing.parentId) : ''}
                >
                  <option value="">{t('categories.topLevel')}</option>
                  {topLevel
                    .filter((item) => item.id !== editing.id)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {translateCategory(t, item.name)}
                      </option>
                    ))}
                </select>
                <small>{t('categories.parentHint')}</small>
              </label>
              <label>
                <span>{t('categories.accentColor')}</span>
                <div className="color-options">
                  {colorOptions.map((color) => (
                    <input
                      key={color}
                      value={color}
                      type="radio"
                      name="color"
                      defaultChecked={color === editing.color}
                      style={{ '--swatch': color } as React.CSSProperties}
                    />
                  ))}
                </div>
              </label>
              <label className="toggle-field">
                <span>
                  <strong>{t('categories.activeSale')}</strong>
                  <small>{t('categories.browseCategory')}</small>
                </span>
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={Boolean(editing.active)}
                />
                <i />
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setEditing(null)}
              >
                {t('common.cancel')}
              </button>
              <button className="primary-button" disabled={saving}>
                {t('common.save')}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
