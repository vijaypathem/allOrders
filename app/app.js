// Main application state
let allRecords = [];
let uniqueIndustries = new Set();
let groupedRecords = {};

// ===============================
// Helper: Extract Display Value from Zoho Fields
// ===============================
function getFieldValue(field) {
  // Handle lookup fields (objects with display_value)
  if (typeof field === 'object' && field !== null) {
    // For multi-select or lookup collections
    if (Array.isArray(field)) {
      const values = field.map(item => getFieldValue(item)).filter(v => v);
      return values.length > 0 ? values.join(', ') : '';
    }
    
    // Check for display_value first (most common for lookup fields)
    if (field.display_value !== undefined && field.display_value !== null) {
      return field.display_value;
    }
    
    // Check for value property
    if (field.value !== undefined && field.value !== null) {
      return field.value;
    }
    
    // If object but no usable value, return empty string
    return '';
  }
  
  // Handle regular values
  return field || '';
}

// ===============================
// Helper: Get Product Details String
// ===============================
function getProductDetailsString(record) {
  // Try to get product details from the record
  const productName = getFieldValue(record.Product_Name);
  const productDetails = getFieldValue(record.Product_Details);
  
  if (productName) return productName;
  if (productDetails) return productDetails;
  
  // Try to extract from Product_Details field if it's an array or object
  if (record.Product_Details) {
    if (Array.isArray(record.Product_Details)) {
      return record.Product_Details.map(p => getFieldValue(p.Product_Name || p)).filter(v => v).join(', ');
    }
  }
  
  return '-';
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
      $("#jobTable tbody").html('<tr><td colspan="10" class="text-danger">Error initializing Zoho Creator</td></tr>');
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
  
  // Clear existing options except the default
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
      reportName: "Unassigned_Jobs1",
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
          $("#jobTable tbody").html('<tr><td colspan="10" class="text-danger">Error fetching records</td></tr>');
        } else {
          const msg = (response && response.message) ? response.message : 'No records found';
          console.warn('No records found:', response);
          $("#jobTable tbody").html(`<tr><td colspan="10" class="text-muted">${msg}</td></tr>`);
        }
      });
  }

  fetchPage();
}

// ===============================
// Group Records by Global Status
// ===============================
function groupRecordsByStatus(data) {
  groupedRecords = {
    'Under Design': [],
    'Await BOM': []
  };
  
  data.forEach(record => {
    const status = getFieldValue(record.Global_Status);
    if (groupedRecords[status]) {
      groupedRecords[status].push(record);
    }
  });
  
  return groupedRecords;
}

// ===============================
// Render Main Table with Grouping
// ===============================
function renderTable(data) {
  const tbody = $("#jobTable tbody");
  tbody.empty();

  if (!data.length) {
    tbody.html('<tr><td colspan="10" class="text-muted">No records found</td></tr>');
    return;
  }

  console.log('Rendering table with', data.length, 'records');

  // Group records by status
  const grouped = groupRecordsByStatus(data);
  
  // Render each group
  Object.keys(grouped).forEach(statusGroup => {
    const records = grouped[statusGroup];
    
    if (records.length > 0) {
      // Add group banner
      const bannerClass = statusGroup.toLowerCase().replace(' ', '-');
      const bannerRow = `
        <tr class="status-group-banner ${bannerClass}" data-group="${statusGroup}">
          <td colspan="10">
            <span class="arrow">▼</span>
            ${statusGroup} (${records.length})
          </td>
        </tr>
      `;
      tbody.append(bannerRow);
      
      // Add records in this group
      records.forEach(record => {
        renderRecord(tbody, record, statusGroup);
      });
    }
  });
  
  // Add click handler for group banners
  $(".status-group-banner").on("click", function() {
    const group = $(this).data("group");
    $(this).toggleClass("collapsed");
    $(`tr[data-group-member="${group}"]`).toggle();
  });
}

// ===============================
// Render Individual Record
// ===============================
function renderRecord(tbody, record, groupStatus) {
  const jobNo = getFieldValue(record.Job_No);
  const designTaskStatus = getFieldValue(record.Design_Task_Status);
  const jobPriority = getFieldValue(record.Job_Priority);
  const jobCreatedDate = getFieldValue(record.Job_Created_Date_Time);
  const clientName = getFieldValue(record.Client_Name);
  const jobType = getFieldValue(record.Job_Type);
  const productDetails = getProductDetailsString(record);
  const primaryCRM = getFieldValue(record.Primary_CRM_Exe1);
  const deliveryDate = getFieldValue(record.Requested_Delivery_Date);
  const globalStatus = getFieldValue(record.Global_Status);
  
  // Format task status
  const taskStatusClass = (designTaskStatus || '').toLowerCase().replace(' ', '-');
  const taskStatusHTML = designTaskStatus ? 
    `<span class="task-status ${taskStatusClass}">${designTaskStatus}</span>` : '-';
  
  // Format priority
  const priorityClass = (jobPriority || 'normal').toLowerCase().replace(' ', '-');
  const priorityHTML = jobPriority ? 
    `<span class="priority ${priorityClass}">${jobPriority}</span>` : '-';
  
  // Format job type
  const jobTypeClass = (jobType || '').toLowerCase().replace(' ', '-');
  const jobTypeHTML = jobType && jobType !== 'Normal' ? 
    `<span class="job-type-badge ${jobTypeClass}">${jobType}</span>` : 
    (jobType === 'Normal' ? `<span class="job-type-badge normal">Normal</span>` : '-');
  
  const row = `
    <tr data-jobno="${jobNo || ''}" data-record-id="${record.ID}" data-group-member="${groupStatus}">
      <td>${taskStatusHTML}</td>
      <td>${priorityHTML}</td>
      <td><a href="#" class="link-cell">${jobNo || '-'}</a></td>
      <td>${jobCreatedDate || '-'}</td>
      <td><a href="#" class="link-cell">${clientName || '-'}</a></td>
      <td>${jobTypeHTML}</td>
      <td><a href="#" class="link-cell">${productDetails}</a></td>
      <td>${primaryCRM || '-'}</td>
      <td>${deliveryDate || '-'}</td>
      <td>${globalStatus || '-'}</td>
    </tr>
  `;
  tbody.append(row);
}

// ===============================
// Apply Filters
// ===============================
function applyFilters() {
  const jobFilter = $("#filterJobNo").val().trim().toLowerCase();
  const clientFilter = $("#filterClient").val().trim().toLowerCase();
  const industryFilter = $("#filterIndustry").val().trim();
  const statusFilter = $("#filterStatus").val().trim();

  console.log('Applying filters:', { jobFilter, clientFilter, industryFilter, statusFilter });

  const filtered = allRecords.filter(record => {
    const jobNo = (getFieldValue(record.Job_No) || '').toString().toLowerCase();
    const clientName = (getFieldValue(record.Client_Name) || '').toString().toLowerCase();
    const industry = (getFieldValue(record.Industry) || '').toString();
    const status = (getFieldValue(record.Global_Status) || '').toString();
    
    const jobMatch = !jobFilter || jobNo.includes(jobFilter);
    const clientMatch = !clientFilter || clientName.includes(clientFilter);
    const industryMatch = !industryFilter || industry === industryFilter;
    const statusMatch = !statusFilter || status === statusFilter;
    
    return jobMatch && clientMatch && industryMatch && statusMatch;
  });

  console.log('Filtered records:', filtered.length);
  renderTable(filtered);
}

// ===============================
// Normalize Record
// ===============================
function normalizeRecord(record) {
  const normalized = {};
  
  const extractFromSource = (source) => {
    if (!source || typeof source !== 'object') return;
    
    Object.entries(source).forEach(([key, value]) => {
      if (key === 'ID' || key === 'ROWID' || key === 'CREATORID' || key === 'MODIFIEDTIME' || key === 'Product_Details') {
        return;
      }
      
      const extractedValue = getFieldValue(value);
      normalized[key] = extractedValue;
    });
  };
  
  if (record.Product_Details && typeof record.Product_Details === 'object') {
    extractFromSource(record.Product_Details);
  }
  
  extractFromSource(record);
  
  return normalized;
}

// ===============================
// Fetch and Display Job Details
// ===============================
function fetchAndShowDetails(jobNo, parentRecord) {
  console.log('Fetching details for Job No:', jobNo, 'Record ID:', parentRecord.ID);
  
  $("#detailProduct").html('<p class="text-muted">Loading product details...</p>');
  $("#detailConsumption").html('<p class="text-muted">Loading consumption details...</p>');

  const productConfig = {
    appName: "zoma",
    reportName: "Job_Details_Report",
    criteria: `(Job_No_Link == ${parentRecord.ID})`,
    page: 1,
    pageSize: 100
  };

  const consumptionConfig = {
    appName: "zoma",
    reportName: "Design_Consumption_Report",
    criteria: `(Job_Link_No == ${parentRecord.ID})`,
    page: 1,
    pageSize: 100
  };

  Promise.all([
    callZohoGetAllRecords(productConfig, 2).catch(e => ({ error: e })),
    callZohoGetAllRecords(consumptionConfig, 2).catch(e => ({ error: e }))
  ]).then(([prodResp, consResp]) => {
    console.log("product detail data",prodResp);
    console.log("Cons detail data",consResp);

    
    if (prodResp && prodResp.code === 3000 && prodResp.data && prodResp.data.length) {
      const prodRecords = prodResp.data.map(normalizeRecord);
      const industryRaw = getFieldValue(parentRecord.Industry) || getFieldValue(parentRecord.Job_Type) || "";
      let industryKey = "";
      
      if (/tensile/i.test(industryRaw)) {
        industryKey = 'Tensile';
      } else if (/roll.*door/i.test(industryRaw) || /door/i.test(industryRaw)) {
        industryKey = 'Roll Door';
      }

      let fieldsToShow = [];
      
      if (industryKey && industryFields[industryKey]) {
        fieldsToShow = industryFields[industryKey].productFields.filter(field => {
          return !['ID', 'ROWID', 'CREATORID', 'MODIFIEDTIME', 'Product_Details'].includes(field);
        });
      } else {
        const allFieldsSet = new Set();
        prodRecords.forEach(record => {
          Object.keys(record).forEach(key => {
            if (!['ID', 'ROWID', 'CREATORID', 'MODIFIEDTIME', 'Product_Details'].includes(key)) {
              allFieldsSet.add(key);
            }
          });
        });
        fieldsToShow = Array.from(allFieldsSet);
      }

      if (fieldsToShow.length === 0) {
        $("#detailProduct").html('<p class="text-muted">No product details available</p>');
      } else {
        let tableHTML = '<table><thead><tr>';
        fieldsToShow.forEach(field => {
          let label = field.replace(/_/g, ' ');
          if (industryKey && industryFields[industryKey]?.fieldLabels?.[field]) {
            label = industryFields[industryKey].fieldLabels[field];
          }
          tableHTML += `<th>${label}</th>`;
        });
        tableHTML += '</tr></thead><tbody>';

        prodRecords.forEach(record => {
          tableHTML += '<tr>';
          fieldsToShow.forEach(field => {
            const value = record[field];
            const displayValue = value ? value : '-';
            tableHTML += `<td>${displayValue}</td>`;
          });
          tableHTML += '</tr>';
        });

        tableHTML += '</tbody></table>';
        $("#detailProduct").html(tableHTML);
      }
    } else {
      $("#detailProduct").html('<p class="text-muted">No product details found</p>');
    }

    if (consResp && consResp.code === 3000 && consResp.data && consResp.data.length) {
      const consRecords = consResp.data.map(normalizeRecord);
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
      } else {
        let tableHTML = '<table><thead><tr>';
        fieldsToShow.forEach(field => {
          tableHTML += `<th>${field.replace(/_/g, ' ')}</th>`;
        });
        tableHTML += '</tr></thead><tbody>';

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
      }
    } else {
      $("#detailConsumption").html('<p class="text-muted">No consumption details found</p>');
    }
    
  }).catch(err => {
    console.error('Error fetching details:', err);
    $("#detailProduct").html('<p class="text-danger">Error loading product details</p>');
    $("#detailConsumption").html('<p class="text-danger">Error loading consumption details</p>');
  });
}

// ===============================
// Show Job Details
// ===============================
function showJobDetails(jobNo) {
  const record = allRecords.find(r => getFieldValue(r.Job_No) === jobNo);
  if (!record) {
    console.error('No record found for Job No:', jobNo);
    return;
  }
  console.log('Primary_CRM_Exe1 value:', record.Primary_CRM_Exe1.display_value);
  console.log('Full record object:', record);
  

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
      <span class="detail-label">Job Priority</span>
      <span class="detail-value">${getFieldValue(record.Job_Priority) || '-'}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Design Task Status</span>
      <span class="detail-value">${getFieldValue(record.Design_Task_Status) || '-'}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Primary CRM</span>
      
      <span class="detail-value">${getFieldValue(record.Primary_CRM_Exe1 || record.Primary_CRM) || '-'}</span>
    </div>
  
    <div class="detail-item">
      <span class="detail-label">Delivery Date</span>
      <span class="detail-value">${getFieldValue(record.Requested_Delivery_Date) || '-'}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Status</span>
      <span class="detail-value">${getFieldValue(record.Global_Status) || '-'}</span>
    </div>
  `;

  $("#detailSummary").html(summaryHTML);
  fetchAndShowDetails(jobNo, record);
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
  
  initializeZoho();

  $("#filterJobNo, #filterClient").on("input", applyFilters);
  $("#filterIndustry, #filterStatus").on("change", applyFilters);

  $(document).on("click", "#jobTable tbody tr:not(.status-group-banner)", function() {
    const jobNo = $(this).data("jobno");
    if (jobNo) {
      showJobDetails(jobNo);
    }
  });

  $("#backBtn").on("click", hideJobDetails);
});
 function autoAdjustColumnWidth(tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;

    const ths = table.querySelectorAll("thead th");
    const colCount = ths.length;

    for (let col = 0; col < colCount; col++) {
      let maxWidth = 0;

      // Include header width
      const headerText = ths[col].innerText.trim();
      const headerWidth = headerText.length * 8; // base width per character
      maxWidth = Math.max(maxWidth, headerWidth);

      // Check all rows
      table.querySelectorAll("tbody tr").forEach(tr => {
        const cell = tr.cells[col];
        if (cell) {
          const cellText = cell.innerText.trim();
          const textWidth = cellText.length * 7; // approximate character width
          maxWidth = Math.max(maxWidth, textWidth);
        }
      });

      // Set column width (minimum 100px)
      ths[col].style.minWidth = Math.max(100, maxWidth) + "px";
      ths[col].style.width = Math.max(100, maxWidth) + "px";
    }
  }

  // Run after table is populated
  $(document).ready(function () {
    const tableId = "jobTable";
    
    // Observe for data changes (useful if table loads async)
    const observer = new MutationObserver(() => {
      autoAdjustColumnWidth(tableId);
    });

    const tbody = document.querySelector(`#${tableId} tbody`);
    if (tbody) {
      observer.observe(tbody, { childList: true, subtree: true });
    }

    // Initial run in case data already exists
    autoAdjustColumnWidth(tableId);
  });