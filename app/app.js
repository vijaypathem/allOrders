// Main application state
let allRecords = [];
let uniqueIndustries = new Set();

// ===============================
// Helper: Extract Display Value from Zoho Fields
// ===============================
function getFieldValue(field) {
  // Handle lookup fields (objects with display_value)
  if (typeof field === 'object') {
    // For multi-select or lookup collections
    if (Array.isArray(field)) {
      const values = field.map(item => getFieldValue(item)).filter(v => v);
      return values.length > 0 ? values.join(', ') : '';
    }
    
    // Check for display_value first (most common for lookup fields)
    if (field.display_value !== undefined && field.display_value !== null) {
      return field.display_value;
    }else {
      return field;
    }
    
    

  }
  
  // Handle regular values - return as is (could be empty string, number, etc.)
  return field ;
}

// ===============================
// Initialize Zoho Creator SDK
// ===============================
function initializeZoho() {
  ZOHO.CREATOR.init()
    .then(function () {
      console.log('Zoho Creator initialized successfully');
      fetchAllRecords();
    })
    .catch(function (error) {
      console.error("Initialization Error:", error);
      $("#jobTable tbody").html('<tr><td colspan="5" class="text-danger">Error initializing Zoho Creator</td></tr>');
    });
}

// ===============================
// Zoho API Helper with Retry Logic
// ===============================
function callZohoGetAllRecords(config, retries = 1, delay = 600) {
  console.log('Calling Zoho API with config:', config);
  return new Promise((resolve) => {
    function attempt(remaining) {
      ZOHO.CREATOR.API.getAllRecords(config)
        .then(function (resp) {
          console.log('Zoho API response:', resp);
          if (resp && resp.code === 3000) {
            resolve(resp);
          } else {
            console.warn('Non-3000 response, retries remaining:', remaining);
            if (remaining > 0) {
              setTimeout(() => attempt(remaining - 1), delay);
            } else {
              resolve(resp);
            }
          }
        })
        .catch(function (err) {
          console.error('Zoho API error, retries remaining:', remaining, err);
          if (remaining > 0) {
            setTimeout(() => attempt(remaining - 1), delay);
          } else {
            resolve({ error: true, errorObj: err });
          }
        });
    }
    attempt(retries);
  });
}

// ===============================
// Populate Industry Filter Dropdown
// ===============================
function populateIndustryFilter() {
  const filterSelect = $("#filterIndustry");
  
  // Clear existing options except the default "All Industries"
  filterSelect.find('option:not(:first)').remove();
  
  // Sort industries alphabetically
  const sortedIndustries = Array.from(uniqueIndustries).sort();
  
  // Add each unique industry as an option
  sortedIndustries.forEach(industry => {
    if (industry) {
      filterSelect.append(`<option value="${industry}">${industry}</option>`);
    }
  });
  
  console.log('Industry filter populated with:', sortedIndustries);
}

// ===============================
// Fetch All Records from Zoho
// ===============================
function fetchAllRecords() {
  allRecords = [];
  uniqueIndustries.clear();
  let page = 1;
  const pageSize = 200;

  function fetchPage() {
    const config = {
      appName: "zoma",
      reportName: "All_Orders_Design",
      criteria: "(Design_Status == \"Under Design\")",
      page: page,
      pageSize: pageSize
    };

    callZohoGetAllRecords(config, 2)
      .then(function (response) {
        if (response && response.code === 3000 && response.data) {
          console.log(`Fetched page ${page} with ${response.data.length} records`);
          
          // Collect unique industries
          response.data.forEach(record => {
            const industry = getFieldValue(record.Industry);
            if (industry) {
              uniqueIndustries.add(industry);
            }
          });
          
          allRecords = allRecords.concat(response.data);

          if (response.data.length < pageSize) {
            console.log('All records fetched. Total:', allRecords.length);
            populateIndustryFilter();
            renderTable(allRecords);
          } else {
            page++;
            fetchPage();
          }
        } else if (response && response.error) {
          console.error('Error fetching records:', response.errorObj || response);
          $("#jobTable tbody").html('<tr><td colspan="5" class="text-danger">Error fetching records</td></tr>');
        } else {
          const msg = (response && response.message) ? response.message : 'No records found';
          console.warn('No records found:', response);
          $("#jobTable tbody").html(`<tr><td colspan="5" class="text-muted">${msg}</td></tr>`);
        }
      });
  }

  fetchPage();
}

// ===============================
// Render Main Table
// ===============================
function renderTable(data) {
  const tbody = $("#jobTable tbody");
  tbody.empty();

  if (!data.length) {
    tbody.html('<tr><td colspan="5" class="text-muted">No records found</td></tr>');
    return;
  }

  console.log('Rendering table with', data.length, 'records');

  data.forEach(record => {
    const jobNo = getFieldValue(record.Job_No);
    const clientName = getFieldValue(record.Client_Name);
    const jobType = getFieldValue(record.Job_Type);
    const industry = getFieldValue(record.Industry);
    const status = getFieldValue(record.Global_Status);
    
    const row = `
      <tr data-jobno="${jobNo || ''}" data-record-id="${record.ID}">
        <td>${jobNo || '-'}</td>
        <td>${clientName || '-'}</td>
        <td>${jobType || '-'}</td>
        <td>${industry || '-'}</td>
        <td>${status || '-'}</td>
      </tr>`;
    tbody.append(row);
  });
}

// ===============================
// Apply Filters
// ===============================
function applyFilters() {
  const jobFilter = $("#filterJobNo").val().trim().toLowerCase();
  const clientFilter = $("#filterClient").val().trim().toLowerCase();
  const industryFilter = $("#filterIndustry").val().trim();

  console.log('Applying filters:', { jobFilter, clientFilter, industryFilter });

  const filtered = allRecords.filter(record => {
    const jobNo = (getFieldValue(record.Job_No) || '').toString().toLowerCase();
    const clientName = (getFieldValue(record.Client_Name) || '').toString().toLowerCase();
    const industry = (getFieldValue(record.Industry) || '').toString();
    
    const jobMatch = !jobFilter || jobNo.includes(jobFilter);
    const clientMatch = !clientFilter || clientName.includes(clientFilter);
    const industryMatch = !industryFilter || industry === industryFilter;
    
    return jobMatch && clientMatch && industryMatch;
  });

  console.log('Filtered records:', filtered.length);
  renderTable(filtered);
}

// ===============================
// Normalize Record - Extract ALL field values properly
// ===============================
function normalizeRecord(record) {
  const normalized = {};
  
  // Helper to extract from source
  const extractFromSource = (source) => {
    if (!source || typeof source !== 'object') return;
    
    Object.entries(source).forEach(([key, value]) => {
      // Skip these meta fields
      if (key === 'ID' || key === 'ROWID' || key === 'CREATORID' || key === 'MODIFIEDTIME' || key === 'Product_Details') {
        return;
      }
      
      const extractedValue = getFieldValue(value);
      // Store ALL fields, even if empty
      normalized[key] = extractedValue;
    });
  };
  
  // First extract from Product_Details if it exists
  if (record.Product_Details && typeof record.Product_Details === 'object') {
    extractFromSource(record.Product_Details);
  }
  
  // Then extract from main record (will overwrite if duplicate keys exist)
  extractFromSource(record);
  
  return normalized;
}

// ===============================
// Fetch and Display Job Details
// ===============================
function fetchAndShowDetails(jobNo, parentRecord) {
  console.log('Fetching details for Job No:', jobNo, 'Record ID:', parentRecord.ID);
  
  // Show loading state
  $("#detailProduct").html('<p class="text-muted">Loading product details...</p>');
  $("#detailConsumption").html('<p class="text-muted">Loading consumption details...</p>');

  // Product details configuration
  const productConfig = {
    appName: "zoma",
    reportName: "Job_Details_Report",
    criteria: `(Job_No_Link == ${parentRecord.ID})`,
    page: 1,
    pageSize: 100
  };

  // Consumption details configuration
  const consumptionConfig = {
    appName: "zoma",
    reportName: "Design_Consumption_Report",
    criteria: `(Job_Link_No == ${parentRecord.ID})`,
    page: 1,
    pageSize: 100
  };

  // Fetch both in parallel
  Promise.all([
    callZohoGetAllRecords(productConfig, 2).catch(e => ({ error: e })),
    callZohoGetAllRecords(consumptionConfig, 2).catch(e => ({ error: e }))
  ]).then(([prodResp, consResp]) => {
    
    console.log('Product response:', prodResp);
    console.log('Consumption response:', consResp);
    
    // Process Product Details
    if (prodResp && prodResp.code === 3000 && prodResp.data && prodResp.data.length) {
      const rawRecords = prodResp.data;
      
      // Normalize all records
      const prodRecords = rawRecords.map(normalizeRecord);
      console.log('Normalized product records:', prodRecords);

      // Determine industry
      const industryRaw = getFieldValue(parentRecord.Industry) || getFieldValue(parentRecord.Job_Type) || "";
      let industryKey = "";
      
      // Match industry key
      if (/tensile/i.test(industryRaw)) {
        industryKey = 'Tensile';
      } else if (/roll.*door/i.test(industryRaw) || /door/i.test(industryRaw)) {
        industryKey = 'Roll Door';
      }

      console.log('Industry detected:', industryKey, 'from:', industryRaw);

      // Determine which fields to show - ALWAYS use configured fields for known industries
      let fieldsToShow = [];
      
      if (industryKey && industryFields[industryKey]) {
        // For KNOWN industries: Show ALL configured fields in the specified order
        fieldsToShow = industryFields[industryKey].productFields.filter(field => {
          // Exclude system fields
          return !['ID', 'ROWID', 'CREATORID', 'MODIFIEDTIME', 'Product_Details'].includes(field);
        });
        console.log(`Showing ALL configured fields for ${industryKey}:`, fieldsToShow);
      } else {
        // For UNKNOWN industries: Show all fields that exist in ANY record
        const allFieldsSet = new Set();
        prodRecords.forEach(record => {
          Object.keys(record).forEach(key => {
            if (!['ID', 'ROWID', 'CREATORID', 'MODIFIEDTIME', 'Product_Details'].includes(key)) {
              allFieldsSet.add(key);
            }
          });
        });
        fieldsToShow = Array.from(allFieldsSet);
        console.log('Unknown industry, showing all available fields:', fieldsToShow);
      }

      // If no fields to show, display message
      if (fieldsToShow.length === 0) {
        $("#detailProduct").html('<p class="text-muted">No product details available</p>');
        return;
      }

      // Build table header with custom labels
      let tableHTML = '<table><thead><tr>';
      fieldsToShow.forEach(field => {
        let label = field.replace(/_/g, ' ');
        
        // Use custom label if defined for this industry
        if (industryKey && industryFields[industryKey]?.fieldLabels?.[field]) {
          label = industryFields[industryKey].fieldLabels[field];
        }
        
        tableHTML += `<th>${label}</th>`;
      });
      tableHTML += '</tr></thead><tbody>';

      // Build table body - show ALL configured fields even if empty
      prodRecords.forEach(record => {
        tableHTML += '<tr>';
        fieldsToShow.forEach(field => {
          const value = record[field];
          // Show '-' for empty/falsy values, otherwise show the value
          const displayValue = value ? value : '-';
          tableHTML += `<td>${displayValue}</td>`;
        });
        tableHTML += '</tr>';
      });

      tableHTML += '</tbody></table>';
      $("#detailProduct").html(tableHTML);
      
    } else {
      console.warn('No product details found');
      $("#detailProduct").html('<p class="text-muted">No product details found</p>');
    }

    // Process Consumption Details
    if (consResp && consResp.code === 3000 && consResp.data && consResp.data.length) {
      const rawConsRecords = consResp.data;
      const consRecords = rawConsRecords.map(normalizeRecord);
      
      console.log('Normalized consumption records:', consRecords);
      
      // Get all unique fields across all records
      const allFieldsSet = new Set();
      consRecords.forEach(record => {
        Object.keys(record).forEach(key => {
          if (!['ID', 'ROWID', 'CREATORID', 'MODIFIEDTIME'].includes(key)) {
            allFieldsSet.add(key);
          }
        });
      });
      
      const fieldsToShow = Array.from(allFieldsSet);
      
      if (fieldsToShow.length === 0) {
        $("#detailConsumption").html('<p class="text-muted">No consumption details available</p>');
        return;
      }

      // Build table header
      let tableHTML = '<table><thead><tr>';
      fieldsToShow.forEach(field => {
        tableHTML += `<th>${field.replace(/_/g, ' ')}</th>`;
      });
      tableHTML += '</tr></thead><tbody>';

      // Build table body
      consRecords.forEach(record => {
        tableHTML += '<tr>';
        fieldsToShow.forEach(field => {
          const value = record[field];
          const displayValue = value ? value : '-';
          tableHTML += `<td>${displayValue}</td>`;
        });
        tableHTML += '</tr>';
      });

      tableHTML += '</tbody></table>';
      $("#detailConsumption").html(tableHTML);
      
    } else {
      console.warn('No consumption details found');
      $("#detailConsumption").html('<p class="text-muted">No consumption details found</p>');
    }
    
  }).catch(err => {
    console.error('Error fetching details:', err);
    $("#detailProduct").html('<p class="text-danger">Error loading product details</p>');
    $("#detailConsumption").html('<p class="text-danger">Error loading consumption details</p>');
  });
}

// ===============================
// Show Job Details in Full Page View
// ===============================
function showJobDetails(jobNo) {
  const record = allRecords.find(r => getFieldValue(r.Job_No) === jobNo);
  if (!record) {
    console.error('No record found for Job No:', jobNo);
    return;
  }

  console.log('Showing details for record:', record);

  // Populate summary
  const summaryHTML = `
    <div class="detail-item">
      <span class="detail-label">Job No</span>
      <span class="detail-value">${getFieldValue(record.Job_No) || '-'}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Client Name</span>
      <span class="detail-value">${getFieldValue(record.Client_Name) || '-'}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Industry</span>
      <span class="detail-value">${getFieldValue(record.Industry) || '-'}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Job Type</span>
      <span class="detail-value">${getFieldValue(record.Job_Type) || '-'}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Delivery Date</span>
      <span class="detail-value">${getFieldValue(record.Requested_Delivery_Date) || '-'}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Job Stage</span>
      <span class="detail-value">${getFieldValue(record.Job_Stage) || '-'}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Status</span>
      <span class="detail-value">${getFieldValue(record.Global_Status) || '-'}</span>
    </div>
  `;

  $("#detailSummary").html(summaryHTML);

  // Fetch and display product/consumption details
  fetchAndShowDetails(jobNo, record);

  // Show detail view with animation
  $("#detailView").addClass('active');
}

// ===============================
// Hide Detail View
// ===============================
function hideJobDetails() {
  $("#detailView").removeClass('active');
}

// ===============================
// Event Listeners
// ===============================
$(document).ready(() => {
  console.log('Document ready, initializing application...');
  
  // Initialize Zoho
  initializeZoho();

  // Filter events
  $("#filterJobNo, #filterClient").on("input", applyFilters);
  $("#filterIndustry").on("change", applyFilters);

  // Row click event - show full page detail view
  $(document).on("click", "#jobTable tbody tr", function() {
    const jobNo = $(this).data("jobno");
    console.log('Row clicked, Job No:', jobNo);
    showJobDetails(jobNo);
  });

  // Back button event
  $("#backBtn").on("click", function() {
    console.log('Back button clicked');
    hideJobDetails();
  });
});