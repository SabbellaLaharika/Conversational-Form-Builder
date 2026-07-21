import React, { useState, useEffect } from 'react';

interface SchemaProperty {
  type?: string;
  title?: string;
  format?: string;
  enum?: string[];
  'x-show-when'?: {
    field: string;
    equals: any;
  };
  description?: string;
}

interface FormSchema {
  type?: string;
  properties?: {
    [key: string]: SchemaProperty;
  };
  required?: string[];
}

interface FormRendererProps {
  schema: FormSchema;
}

export const FormRenderer: React.FC<FormRendererProps> = ({ schema }) => {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [submittedData, setSubmittedData] = useState<any>(null);

  // Reset form data when schema changes
  useEffect(() => {
    const initialData: Record<string, any> = {};
    if (schema.properties) {
      Object.keys(schema.properties).forEach((key) => {
        const prop = schema.properties![key];
        if (prop.type === 'boolean') {
          initialData[key] = false;
        } else {
          initialData[key] = '';
        }
      });
    }
    setFormData(initialData);
    setSubmittedData(null);
  }, [schema]);

  const handleChange = (fieldName: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedData(formData);
  };

  if (!schema || !schema.properties || Object.keys(schema.properties).length === 0) {
    return (
      <div className="empty-form-state">
        <p>No form schema generated yet. Describe the form you need in the chat to start!</p>
      </div>
    );
  }

  // Determine if a field should be shown based on "x-show-when" property
  const shouldShowField = (prop: SchemaProperty) => {
    if (!prop['x-show-when']) {
      return true;
    }
    const condition = prop['x-show-when'];
    const dependentValue = formData[condition.field];
    return dependentValue === condition.equals;
  };

  return (
    <div className="form-container">
      <form onSubmit={handleSubmit} className="form-renderer-body">
        {Object.keys(schema.properties).map((key) => {
          const prop = schema.properties![key];
          if (!shouldShowField(prop)) {
            return null;
          }

          const isRequired = schema.required?.includes(key);

          return (
            <div key={key} className="form-field-group" data-testid={`field-container-${key}`}>
              <label htmlFor={key} className="form-label">
                {prop.title || key} {isRequired && <span className="required-asterisk">*</span>}
              </label>

              {prop.enum ? (
                <select
                  id={key}
                  name={key}
                  value={formData[key] || ''}
                  onChange={(e) => handleChange(key, e.target.value)}
                  required={isRequired}
                  data-testid={`field-${key}`}
                  className="form-select"
                >
                  <option value="">Select option...</option>
                  {prop.enum.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : prop.type === 'boolean' ? (
                <div className="checkbox-wrapper">
                  <input
                    type="checkbox"
                    id={key}
                    name={key}
                    checked={!!formData[key]}
                    onChange={(e) => handleChange(key, e.target.checked)}
                    data-testid={`field-${key}`}
                    className="form-checkbox"
                  />
                  <span className="checkbox-custom-label">{prop.description || 'Enable'}</span>
                </div>
              ) : (
                <input
                  type={prop.format === 'email' ? 'email' : prop.type === 'integer' || prop.type === 'number' ? 'number' : 'text'}
                  id={key}
                  name={key}
                  value={formData[key] || ''}
                  onChange={(e) => handleChange(key, e.target.value)}
                  required={isRequired}
                  placeholder={prop.description || `Enter ${prop.title || key}`}
                  data-testid={`field-${key}`}
                  className="form-input"
                />
              )}
            </div>
          );
        })}

        <button type="submit" className="form-submit-button">
          Submit Form Data
        </button>
      </form>

      {submittedData && (
        <div className="submitted-data-output">
          <h4>Submitted Data</h4>
          <pre>{JSON.stringify(submittedData, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};
